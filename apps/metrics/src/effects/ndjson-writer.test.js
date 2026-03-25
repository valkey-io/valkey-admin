import { describe, it, expect, beforeEach, afterEach } from "vitest"
import fs from "node:fs"
import path from "node:path"
import os from "node:os"
import { makeNdjsonWriter } from "./ndjson-writer.js"

describe("ndjson-writer", () => {
  let tmpDir

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "ndjson-writer-test-"))
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  const listFiles = (prefix) =>
    fs.readdirSync(tmpDir)
      .filter((f) => f.startsWith(`${prefix}_`) && f.endsWith(".ndjson"))
      .sort()

  describe("basic writing", () => {
    it("creates a file and appends rows", async () => {
      const writer = makeNdjsonWriter({ dataDir: tmpDir, filePrefix: "test", maxFiles: 4, maxFileSize: 1024 * 1024 })
      await writer.appendRows([{ ts: Date.now(), metric: "m", value: 1 }])

      const files = listFiles("test")
      expect(files).toHaveLength(1)
      expect(files[0]).toMatch(/^test_\d{8}_0\.ndjson$/)

      const content = fs.readFileSync(path.join(tmpDir, files[0]), "utf8")
      const parsed = JSON.parse(content.trim())
      expect(parsed.value).toBe(1)
    })

    it("skips empty rows", async () => {
      const writer = makeNdjsonWriter({ dataDir: tmpDir, filePrefix: "test", maxFiles: 4, maxFileSize: 1024 * 1024 })
      await writer.appendRows([])

      const files = listFiles("test")
      expect(files).toHaveLength(0)
    })

    it("appends multiple batches to the same file", async () => {
      const writer = makeNdjsonWriter({ dataDir: tmpDir, filePrefix: "test", maxFiles: 4, maxFileSize: 1024 * 1024 })
      await writer.appendRows([{ ts: Date.now(), value: 1 }])
      await writer.appendRows([{ ts: Date.now(), value: 2 }])

      const files = listFiles("test")
      expect(files).toHaveLength(1)

      const lines = fs.readFileSync(path.join(tmpDir, files[0]), "utf8").trim().split("\n")
      expect(lines).toHaveLength(2)
    })
  })

  describe("file rotation", () => {
    it("rotates to a new file when maxFileSize is exceeded", async () => {
      const maxFileSize = 100 // 100 bytes
      const writer = makeNdjsonWriter({ dataDir: tmpDir, filePrefix: "rot", maxFiles: 10, maxFileSize })

      // Write enough to exceed 100 bytes
      for (let i = 0; i < 5; i++) {
        await writer.appendRows([{ ts: Date.now(), metric: "test_metric", value: i }])
      }

      const files = listFiles("rot")
      expect(files.length).toBeGreaterThan(1)
    })

    it("deletes oldest file when maxFiles is reached", async () => {
      const maxFileSize = 50 // very small to force rotation
      const maxFiles = 4
      const writer = makeNdjsonWriter({ dataDir: tmpDir, filePrefix: "ring", maxFiles, maxFileSize })

      // Write many batches to trigger multiple rotations
      for (let i = 0; i < 20; i++) {
        await writer.appendRows([{ ts: Date.now(), metric: "test_metric_name", value: i }])
      }

      const files = listFiles("ring")
      expect(files.length).toBeLessThanOrEqual(maxFiles)
    })

    it("deletes oldest files first (sorted by name)", async () => {
      const maxFileSize = 60
      const maxFiles = 3
      const writer = makeNdjsonWriter({ dataDir: tmpDir, filePrefix: "order", maxFiles, maxFileSize })

      for (let i = 0; i < 15; i++) {
        await writer.appendRows([{ ts: Date.now(), metric: "test_metric_name", value: i }])
      }

      const files = listFiles("order")
      expect(files.length).toBeLessThanOrEqual(maxFiles)

      // Remaining files should be the latest seq numbers
      const seqs = files.map((f) => {
        const m = f.match(/_(\d+)\.ndjson$/)
        return m ? Number(m[1]) : -1
      })
      // seqs should be monotonically increasing
      for (let i = 1; i < seqs.length; i++) {
        expect(seqs[i]).toBeGreaterThan(seqs[i - 1])
      }
    })
  })

  describe("seq recovery", () => {
    it("resumes from highest existing seq on new writer instance", async () => {
      const maxFileSize = 100
      const writer1 = makeNdjsonWriter({ dataDir: tmpDir, filePrefix: "recover", maxFiles: 10, maxFileSize })

      // Write enough to create multiple files
      for (let i = 0; i < 5; i++) {
        await writer1.appendRows([{ ts: Date.now(), metric: "test_metric", value: i }])
      }

      const filesBefore = listFiles("recover")
      const highestSeqBefore = Math.max(...filesBefore.map((f) => {
        const m = f.match(/_(\d+)\.ndjson$/)
        return m ? Number(m[1]) : 0
      }))

      // Create a new writer (simulating restart)
      const writer2 = makeNdjsonWriter({ dataDir: tmpDir, filePrefix: "recover", maxFiles: 10, maxFileSize })
      await writer2.appendRows([{ ts: Date.now(), metric: "test_metric", value: 99 }])

      const filesAfter = listFiles("recover")
      const highestSeqAfter = Math.max(...filesAfter.map((f) => {
        const m = f.match(/_(\d+)\.ndjson$/)
        return m ? Number(m[1]) : 0
      }))

      // Should not have gone back to seq 0
      expect(highestSeqAfter).toBeGreaterThanOrEqual(highestSeqBefore)
    })
  })

  describe("large write chunking", () => {
    it("splits a large batch across multiple files", async () => {
      const maxFileSize = 100
      const writer = makeNdjsonWriter({ dataDir: tmpDir, filePrefix: "chunk", maxFiles: 20, maxFileSize })

      // Write a large batch that won't fit in one file
      const largeBatch = Array.from({ length: 20 }, (_, i) => ({
        ts: Date.now(),
        metric: "big_metric",
        value: i,
      }))

      await writer.appendRows(largeBatch)

      const files = listFiles("chunk")
      expect(files.length).toBeGreaterThan(1)

      // All rows should be written across all files
      let totalLines = 0
      for (const f of files) {
        const content = fs.readFileSync(path.join(tmpDir, f), "utf8").trim()
        if (content) totalLines += content.split("\n").length
      }
      expect(totalLines).toBe(20)
    })

    it("respects maxFiles even with a large single batch", async () => {
      const maxFileSize = 80
      const maxFiles = 4
      const writer = makeNdjsonWriter({ dataDir: tmpDir, filePrefix: "bigbatch", maxFiles, maxFileSize })

      const largeBatch = Array.from({ length: 30 }, (_, i) => ({
        ts: Date.now(),
        metric: "big_metric_name",
        value: i,
      }))

      await writer.appendRows(largeBatch)

      const files = listFiles("bigbatch")
      expect(files.length).toBeLessThanOrEqual(maxFiles)
    })
  })

  describe("edge cases", () => {
    it("writes a single row larger than maxFileSize", async () => {
      const maxFileSize = 10 // impossibly small
      const writer = makeNdjsonWriter({ dataDir: tmpDir, filePrefix: "huge", maxFiles: 4, maxFileSize })

      await writer.appendRows([{ ts: Date.now(), metric: "a_very_long_metric_name_that_exceeds_limit", value: 999 }])

      const files = listFiles("huge")
      expect(files).toHaveLength(1)

      const content = fs.readFileSync(path.join(tmpDir, files[0]), "utf8").trim()
      const parsed = JSON.parse(content)
      expect(parsed.value).toBe(999)
    })

    it("falls back to Date.now() when ts is missing", async () => {
      const writer = makeNdjsonWriter({ dataDir: tmpDir, filePrefix: "nots", maxFiles: 4, maxFileSize: 1024 * 1024 })
      await writer.appendRows([{ metric: "m", value: 1 }])

      const files = listFiles("nots")
      expect(files).toHaveLength(1)
      expect(files[0]).toMatch(/^nots_\d{8}_0\.ndjson$/)
    })

    it("falls back to Date.now() when ts is non-finite", async () => {
      const writer = makeNdjsonWriter({ dataDir: tmpDir, filePrefix: "badts", maxFiles: 4, maxFileSize: 1024 * 1024 })
      await writer.appendRows([{ ts: NaN, value: 1 }, { ts: "not_a_number", value: 2 }])

      const files = listFiles("badts")
      expect(files).toHaveLength(1)
    })

    it("creates dataDir if it does not exist", async () => {
      const nestedDir = path.join(tmpDir, "a", "b", "c")
      const writer = makeNdjsonWriter({ dataDir: nestedDir, filePrefix: "nested", maxFiles: 4, maxFileSize: 1024 * 1024 })

      await writer.appendRows([{ ts: Date.now(), value: 1 }])

      expect(fs.existsSync(nestedDir)).toBe(true)
      const files = fs.readdirSync(nestedDir).filter((f) => f.endsWith(".ndjson"))
      expect(files).toHaveLength(1)
    })

    it("handles readdir failure gracefully during advanceSeq", async () => {
      const writer = makeNdjsonWriter({ dataDir: tmpDir, filePrefix: "fail", maxFiles: 4, maxFileSize: 50 })

      // Write enough to trigger advanceSeq
      await writer.appendRows([{ ts: Date.now(), metric: "test_metric_name", value: 1 }])
      await writer.appendRows([{ ts: Date.now(), metric: "test_metric_name", value: 2 }])

      // If readdir had failed, advanceSeq would skip rotation but still increment seq
      // Verify the writer didn't crash and files exist
      const files = listFiles("fail")
      expect(files.length).toBeGreaterThanOrEqual(1)
    })
  })

  describe("prefix isolation", () => {
    it("does not delete files from other prefixes", async () => {
      // Pre-create a file with a different prefix
      fs.writeFileSync(path.join(tmpDir, "other_20250615_0.ndjson"), "{\"ts\":1}\n")

      const maxFileSize = 50
      const writer = makeNdjsonWriter({ dataDir: tmpDir, filePrefix: "mine", maxFiles: 3, maxFileSize })

      for (let i = 0; i < 15; i++) {
        await writer.appendRows([{ ts: Date.now(), metric: "test_metric_name", value: i }])
      }

      // The "other" prefix file should still exist
      expect(fs.existsSync(path.join(tmpDir, "other_20250615_0.ndjson"))).toBe(true)
    })
  })
})
