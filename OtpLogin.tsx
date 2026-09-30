"use client"

// @ts-nocheck
/** @jsx React.createElement */

import * as React from "react"

function cn(...classes: Array<string | undefined | null | false>) {
  return classes.filter(Boolean).join(" ")
}

type OTPInputSlot = {
  char: string
  hasFakeCaret: boolean
  isActive: boolean
}

const OTPInputContext = React.createContext<{ slots: OTPInputSlot[] }>({
  slots: []
})

function OTPInput({
  className,
  containerClassName,
  value = "",
  maxLength = 6,
  children,
  ...props
}: React.ComponentProps<"div"> & {
  containerClassName?: string
  value?: string
  maxLength?: number
  onChange?: (value: string) => void
}) {
  const slots = React.useMemo<OTPInputSlot[]>(() => {
    return Array.from({ length: maxLength }, (_, index) => ({
      char: value[index] ?? "",
      hasFakeCaret: false,
      isActive: index === value.length && value.length < maxLength
    }))
  }, [maxLength, value])

  return (
    <OTPInputContext.Provider value={{ slots }}>
      <div
        data-slot="input-otp"
        className={cn(
          "cn-input-otp flex items-center has-disabled:opacity-50",
          containerClassName
        )}
        spellCheck={false}
        {...props}
      >
        <div className={cn("disabled:cursor-not-allowed", className)}>{children}</div>
      </div>
    </OTPInputContext.Provider>
  )
}

function MinusIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M5 12h14" />
    </svg>
  )
}

declare global {
  namespace JSX {
    interface IntrinsicElements {
      [elemName: string]: any
    }
  }
}

function InputOTP({
  className,
  containerClassName,
  ...props
}: React.ComponentProps<typeof OTPInput> & {
  containerClassName?: string
}) {
  return (
    <OTPInput
      data-slot="input-otp"
      containerClassName={cn(
        "cn-input-otp flex items-center has-disabled:opacity-50",
        containerClassName
      )}
      spellCheck={false}
      className={cn("disabled:cursor-not-allowed", className)}
      {...props}
    />
  )
}

function InputOTPGroup({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="input-otp-group"
      className={cn(
        "flex items-center rounded-lg has-aria-invalid:border-destructive has-aria-invalid:ring-3 has-aria-invalid:ring-destructive/20 dark:has-aria-invalid:ring-destructive/40",
        className
      )}
      {...props}
    />
  )
}

function InputOTPSlot({
  index,
  className,
  ...props
}: React.ComponentProps<"div"> & {
  index: number
}) {
  const inputOTPContext = React.useContext(OTPInputContext)
  const { char, hasFakeCaret, isActive } = inputOTPContext?.slots[index] ?? {}

  return (
    <div
      data-slot="input-otp-slot"
      data-active={isActive}
      className={cn(
        "relative flex size-8 items-center justify-center border-y border-r border-input text-sm transition-all outline-none first:rounded-l-lg first:border-l last:rounded-r-lg aria-invalid:border-destructive data-[active=true]:z-10 data-[active=true]:border-ring data-[active=true]:ring-3 data-[active=true]:ring-ring/50 data-[active=true]:aria-invalid:border-destructive data-[active=true]:aria-invalid:ring-destructive/20 dark:bg-input/30 dark:data-[active=true]:aria-invalid:ring-destructive/40",
        className
      )}
      {...props}
    >
      {char}
      {hasFakeCaret && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="h-4 w-px animate-caret-blink bg-foreground duration-1000" />
        </div>
      )}
    </div>
  )
}

function InputOTPSeparator({ ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="input-otp-separator"
      className="flex items-center [&_svg:not([class*='size-'])]:size-4"
      role="separator"
      {...props}
    >
      <MinusIcon />
    </div>
  )
}

export { InputOTP, InputOTPGroup, InputOTPSlot, InputOTPSeparator }
