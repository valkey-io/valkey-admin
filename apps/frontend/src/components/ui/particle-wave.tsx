import React, { useRef, useEffect } from "react"
import * as THREE from "three"

interface ParticleWaveProps {
  className?: string
}

/**
 * Animated Three.js particle-wave background.
 *
 * Renders with a transparent clear color so it sits behind page content as a
 * subtle backdrop. Particle color adapts to the current (light/dark) theme.
 * Sized to its parent container rather than the full window.
 */
const ParticleWave: React.FC<ParticleWaveProps> = ({ className = "" }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const sceneRef = useRef<{
    scene: THREE.Scene
    camera: THREE.PerspectiveCamera
    renderer: THREE.WebGLRenderer
    particles: THREE.Points
    particleMaterial: THREE.ShaderMaterial
    animationId: number | null
  } | null>(null)

  const getCurrentTheme = () =>
    document.documentElement.classList.contains("dark") ? "dark" : "light"

  const getParticleColor = (theme: string) =>
    theme === "dark"
      ? new THREE.Vector3(0.45, 0.5, 0.95) // soft indigo for dark theme
      : new THREE.Vector3(0.3, 0.35, 0.7) // muted indigo for light theme

  const particleVertex = `
    attribute float scale;
    uniform float uTime;
    void main() {
      vec3 p = position;
      float s = scale;
      p.y += (sin(p.x + uTime) * 0.5) + (cos(p.y + uTime) * 0.1) * 2.0;
      p.x += (sin(p.y + uTime) * 0.5);
      s += (sin(p.x + uTime) * 0.5) + (cos(p.y + uTime) * 0.1) * 2.0;
      vec4 mvPosition = modelViewMatrix * vec4(p, 1.0);
      gl_PointSize = s * 12.0 * (1.0 / -mvPosition.z);
      gl_Position = projectionMatrix * mvPosition;
    }
  `

  const particleFragment = `
    uniform vec3 uColor;
    void main() {
      gl_FragColor = vec4(uColor, 0.35);
    }
  `

  const sizeToParent = (canvas: HTMLCanvasElement) => {
    const parent = canvas.parentElement
    const w = parent?.clientWidth || window.innerWidth
    const h = parent?.clientHeight || window.innerHeight
    return { w, h }
  }

  const initScene = () => {
    if (!canvasRef.current) return
    const canvas = canvasRef.current
    const { w, h } = sizeToParent(canvas)
    const aspectRatio = w / h

    const camera = new THREE.PerspectiveCamera(75, aspectRatio, 0.01, 1000)
    camera.position.set(0, 6, 5)

    const scene = new THREE.Scene()

    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.setSize(w, h, false)
    renderer.setClearColor(0x000000, 0) // transparent — show page behind

    const gap = 0.3
    const amountX = 200
    const amountY = 200
    const particleNum = amountX * amountY
    const particlePositions = new Float32Array(particleNum * 3)
    const particleScales = new Float32Array(particleNum)
    let i = 0
    let j = 0
    for (let ix = 0; ix < amountX; ix++) {
      for (let iy = 0; iy < amountY; iy++) {
        particlePositions[i] = ix * gap - (amountX * gap) / 2
        particlePositions[i + 1] = 0
        particlePositions[i + 2] = iy * gap - (amountX * gap) / 2
        particleScales[j] = 1
        i += 3
        j++
      }
    }
    const particleGeometry = new THREE.BufferGeometry()
    particleGeometry.setAttribute("position", new THREE.BufferAttribute(particlePositions, 3))
    particleGeometry.setAttribute("scale", new THREE.BufferAttribute(particleScales, 1))

    const particleMaterial = new THREE.ShaderMaterial({
      transparent: true,
      vertexShader: particleVertex,
      fragmentShader: particleFragment,
      uniforms: {
        uTime: { value: 0 },
        uColor: { value: getParticleColor(getCurrentTheme()) },
      },
    })

    const particles = new THREE.Points(particleGeometry, particleMaterial)
    scene.add(particles)

    sceneRef.current = { scene, camera, renderer, particles, particleMaterial, animationId: null }
  }

  const animate = () => {
    if (!sceneRef.current) return
    const { scene, camera, renderer, particleMaterial } = sceneRef.current
    particleMaterial.uniforms.uTime.value += 0.03
    particleMaterial.uniforms.uColor.value = getParticleColor(getCurrentTheme())
    camera.lookAt(scene.position)
    renderer.render(scene, camera)
    sceneRef.current.animationId = requestAnimationFrame(animate)
  }

  const handleResize = () => {
    if (!sceneRef.current || !canvasRef.current) return
    const { camera, renderer } = sceneRef.current
    const { w, h } = sizeToParent(canvasRef.current)
    camera.aspect = w / h
    camera.updateProjectionMatrix()
    renderer.setSize(w, h, false)
  }

  useEffect(() => {
    initScene()
    animate()
    window.addEventListener("resize", handleResize)

    return () => {
      if (sceneRef.current?.animationId) cancelAnimationFrame(sceneRef.current.animationId)
      window.removeEventListener("resize", handleResize)
      if (sceneRef.current) {
        const { scene, renderer, particles } = sceneRef.current
        scene.remove(particles)
        particles.geometry?.dispose()
        if (Array.isArray(particles.material)) particles.material.forEach((m) => m.dispose())
        else particles.material.dispose()
        renderer.dispose()
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <canvas
      ref={canvasRef}
      className={`absolute inset-0 z-[-10] block size-full ${className}`}
    />
  )
}

export { ParticleWave }
