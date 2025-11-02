"use client";

import * as React from "react";
import { PhoneInput } from "react-international-phone";
import "react-international-phone/style.css";
import { cn } from "@/lib/utils";

type PhoneInputProps = {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  "aria-invalid"?: boolean;
  "aria-describedby"?: string;
  autoFocus?: boolean;
};

export const PhoneInputField = React.forwardRef<HTMLInputElement, PhoneInputProps>(
  (
    {
      value,
      onChange,
      placeholder = "+316 123 456 78",
      className,
      disabled,
      "aria-invalid": ariaInvalid,
      "aria-describedby": ariaDescribedBy,
      autoFocus
    }
  ) => {
    const [isDropdownOpen, setIsDropdownOpen] = React.useState(false);
    const containerRef = React.useRef<HTMLDivElement>(null);

    // Detecteer wanneer dropdown open is door te luisteren naar DOM changes
    React.useEffect(() => {
      const checkDropdown = () => {
        const dropdown = document.querySelector('.react-international-phone-country-selector-dropdown');
        const isVisible = dropdown && 
          dropdown instanceof HTMLElement && 
          dropdown.offsetParent !== null &&
          !dropdown.hasAttribute('hidden') &&
          dropdown.style.display !== 'none';
        
        setIsDropdownOpen(!!isVisible);
      };

      // Check direct
      checkDropdown();

      // Luister naar clicks op de button
      const handleClick = (e: MouseEvent) => {
        const target = e.target as HTMLElement;
        const isDropdownButton = target.closest('.react-international-phone-country-selector-button');
        
        if (isDropdownButton) {
          // Wacht even zodat de dropdown tijd heeft om te renderen
          setTimeout(checkDropdown, 50);
        } else {
          // Check na een korte delay om te zien of dropdown nog bestaat
          setTimeout(checkDropdown, 100);
        }
      };

      // Observeer DOM changes voor dropdown
      const observer = new MutationObserver(() => {
        checkDropdown();
      });

      // Observeer het document body voor dropdown changes
      observer.observe(document.body, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['style', 'hidden', 'class']
      });

      document.addEventListener('click', handleClick);

      return () => {
        observer.disconnect();
        document.removeEventListener('click', handleClick);
      };
    }, []);

    return (
      <div className={cn("relative w-full", isDropdownOpen && "overflow-visible z-[100]", className)}>
        <div
          ref={containerRef}
          className={cn(
            "group flex items-stretch rounded-lg border bg-background shadow-sm transition-all",
            isDropdownOpen ? "overflow-visible" : "overflow-hidden",
            ariaInvalid
              ? "border-destructive ring-1 ring-destructive"
              : "border-input",
            "focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2"
          )}
          style={isDropdownOpen ? { overflow: 'visible' } : undefined}
        >
          <PhoneInput
            value={value}
            onChange={onChange}
            defaultCountry="nl"
            placeholder={placeholder}
            disabled={disabled}
            inputProps={{
              autoFocus,
              "aria-invalid": ariaInvalid,
              "aria-describedby": ariaDescribedBy,
              className: cn(
                "h-11 w-full border-0 bg-transparent px-4 py-2 text-base transition-colors placeholder:text-muted-foreground focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50",
                ariaInvalid && "text-destructive placeholder:text-destructive/70"
              )
            }}
            countrySelectorStyleProps={{
              buttonClassName: cn(
                "h-full shrink-0 border-0 bg-transparent px-3 py-2 transition-colors hover:bg-accent/50 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50 flex items-center gap-2"
              ),
              dropdownStyleProps: {
                className: "max-h-[300px] overflow-y-auto rounded-lg border border-input bg-popover shadow-lg z-[100] mt-1"
              }
            }}
          />
        </div>
      </div>
    );
  }
);

PhoneInputField.displayName = "PhoneInputField";

