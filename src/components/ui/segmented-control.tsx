"use client"

import * as React from "react"
import { Slottable } from "@radix-ui/react-slot"
import * as TabsPrimitive from "@radix-ui/react-tabs"
import mergeRefs from "merge-refs"

import { useTabObserver } from "../../hooks/use-tab-observer"
import { cn } from "../../utils/cn"

function Tabs({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Root>) {
  return (
    <TabsPrimitive.Root
      data-slot="tabs"
      className={cn("flex flex-col gap-2", className)}
      {...props}
    />
  )
}

interface TabsListProps extends React.ComponentProps<typeof TabsPrimitive.List> {
  floatingBgClassName?: string
  floatingBgColor?: string
  containerBgColor?: string
}

function TabsList({
  className,
  children,
  floatingBgClassName,
  floatingBgColor,
  containerBgColor,
  style,
  ...props
}: TabsListProps) {
  const [lineStyle, setLineStyle] = React.useState({ width: 0, left: 0 })

  const { mounted, listRef } = useTabObserver({
    onActiveTabChange: (_index: number, activeTab: HTMLElement) => {
      const { offsetWidth: width, offsetLeft: left } = activeTab
      setLineStyle({ width, left })
    },
  })

  return (
    <TabsPrimitive.List
      ref={mergeRefs(listRef)}
      data-slot="tabs-list"
      className={cn(
        "relative isolate inline-flex h-8 w-fit items-center justify-center rounded-lg p-[3px]",
        className
      )}
      style={{
        backgroundColor: containerBgColor,
        ...style,
      }}
      {...props}
    >
      <Slottable>{children}</Slottable>

      <div
        className={cn(
          "absolute inset-y-1 left-0 -z-10 rounded-md transition-transform duration-200",
          {
            hidden: !mounted,
          },
          floatingBgClassName
        )}
        style={{
          transform: `translate3d(${lineStyle.left}px, 0, 0)`,
          width: `${lineStyle.width}px`,
          transitionTimingFunction: "cubic-bezier(0.65, 0, 0.35, 1)",
          backgroundColor: floatingBgColor,
          boxShadow: "0 1px 2px 0 rgb(0 0 0 / 0.05)",
        }}
        aria-hidden="true"
      />
    </TabsPrimitive.List>
  )
}

function TabsTrigger({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      data-slot="tabs-trigger"
      className={cn(
        "data-[state=active]:bg-background dark:data-[state=active]:text-foreground focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:outline-ring dark:data-[state=active]:border-input dark:data-[state=active]:bg-input/30 text-foreground dark:text-muted-foreground inline-flex h-[calc(100%-1px)] flex-1 items-center justify-center gap-1.5 rounded-md border border-transparent px-2 py-1 text-sm font-medium whitespace-nowrap transition-[color,box-shadow] focus-visible:ring-[3px] focus-visible:outline-1 disabled:pointer-events-none disabled:opacity-50 data-[state=active]:shadow-sm [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        className
      )}
      {...props}
    />
  )
}

function TabsContent({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Content>) {
  return (
    <TabsPrimitive.Content
      data-slot="tabs-content"
      className={cn("flex-1 outline-none", className)}
      {...props}
    />
  )
}

export { Tabs, TabsList, TabsTrigger, TabsContent }
