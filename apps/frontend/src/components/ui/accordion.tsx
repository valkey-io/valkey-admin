import { useState, useMemo, useEffect } from "react"
import { CircleChevronDown, CircleChevronUp, Dot, CircleQuestionMark } from "lucide-react"
import { formatMetricValue, type ValueType } from "@common/src/format-metric-value"
import { TooltipProvider } from "@radix-ui/react-tooltip"
import { CustomTooltip } from "./custom-tooltip"

interface AccordionProps {
  accordionName?: string;
  accordionItems?: Record<string, number | null>;
  valueType?: ValueType;
  searchQuery?: string;
  accordionDescription?: string;
  singleMetricDescriptions?: Record<string, { description: string; unit: string }>;
}

export default function Accordion({ accordionName, accordionItems, valueType = "number", searchQuery = "",
  accordionDescription = "", singleMetricDescriptions = {} }: AccordionProps) {
  const [isOpen, setIsOpen] = useState(false)

  const ToggleIcon = isOpen ? CircleChevronUp : CircleChevronDown

  const formatKey = (key: string) => {
    return key
      .split("_")
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ")
  }

  const filteredItems = useMemo(() => {
    if (!accordionItems) return {}
    if (!searchQuery.trim()) return accordionItems

    const query = searchQuery.toLowerCase()
    return Object.entries(accordionItems).reduce((acc, [key, value]) => {
      const formattedKey = formatKey(key).toLowerCase()
      if (formattedKey.includes(query) || key.toLowerCase().includes(query)) {
        acc[key] = value
      }
      return acc
    }, {} as Record<string, number | null>)
  }, [accordionItems, searchQuery])

  const itemCount = accordionItems ? Object.keys(accordionItems).length : 0
  const filteredItemCount = Object.keys(filteredItems).length
  const hasMatches = filteredItemCount > 0

  // for opening accordions if matches found otherwise closing
  useEffect(() => {
    if (searchQuery.trim() && hasMatches) {
      setIsOpen(true)
    } else {
      setIsOpen(false)
    }
  }, [searchQuery, hasMatches])

  // not rendering accordions if there is no match
  if (searchQuery.trim() && !hasMatches) {
    return null
  }

  return (
    <div className="w-full mt-2">
      <TooltipProvider>
        <div className="h-14 px-2 py-4 dark:border-tw-dark-border border rounded flex items-center gap-2 justify-between">
          <div className="flex flex-col gap-1">
            <span className="font-semibold text-sm flex items-center gap-1">{accordionName}
              <CustomTooltip description={accordionDescription}>
                <CircleQuestionMark className="bg-tw-primary/10 rounded-full text-tw-primary" size={16} />
              </CustomTooltip>
            </span>
            <span className="text-xs font-light text-tw-dark-border">
              {searchQuery.trim() && filteredItemCount !== itemCount ? (
                <>{filteredItemCount} of {itemCount} {itemCount === 1 ? "metric" : "metrics"}</>
              ) : (
                <>{itemCount} {itemCount === 1 ? "metric" : "metrics"}</>
              )}</span>
          </div>
          <button onClick={() => setIsOpen(!isOpen)}><ToggleIcon className="text-tw-primary cursor-pointer hover:text-tw-primary/80" /></button>
        </div>
      </TooltipProvider>

      {isOpen && (
        <div className="px-2 py-3 border bg-gray-50 dark:bg-gray-800 text-sm dark:border-tw-dark-border rounded-b">
          <ul className="space-y-2">
            {Object.entries(filteredItems).map(([key, value]) => (
              <li className="flex justify-between items-center border-b last:border-b-0" key={key}>
                <div className="flex items-center gap-1">
                  <span className="font-normal flex items-center"><Dot className="text-tw-primary" size={30} />{formatKey(key)}</span>
                  {singleMetricDescriptions[key] && (
                    <CustomTooltip description={singleMetricDescriptions[key].description} unit={singleMetricDescriptions[key].unit}>
                      <CircleQuestionMark className="bg-tw-primary/10 rounded-full text-tw-primary" size={13} />
                    </CustomTooltip>
                  )}
                </div>
                <span className="font-light">{formatMetricValue(key, value, valueType)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
};
