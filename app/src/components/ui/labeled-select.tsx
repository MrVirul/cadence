import * as React from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { X } from "lucide-react";

export interface LabeledSelectOption<T extends string = string> {
  value: T;
  label: React.ReactNode;
  textValue?: string;
  disabled?: boolean;
}

export interface LabeledSelectProps<T extends string = string> {
  value?: T | null;
  onValueChange?: (value: T) => void;
  options: LabeledSelectOption<T>[];
  placeholder?: string;
  disabled?: boolean;
  size?: "sm" | "default";
  className?: string;
  triggerClassName?: string;
  id?: string;
  name?: string;
  "aria-label"?: string;
  clearable?: boolean;
  onClear?: () => void;
}

export function LabeledSelect<T extends string = string>({
  value,
  onValueChange,
  options,
  placeholder,
  disabled,
  size = "default",
  className,
  triggerClassName,
  id,
  name,
  "aria-label": ariaLabel,
  clearable,
  onClear,
}: LabeledSelectProps<T>) {
  // Base UI resolves labels when items is provided to Select.Root
  const items = React.useMemo(() => {
    return options.map((opt) => ({
      value: opt.value,
      label:
        opt.textValue ??
        (typeof opt.label === "string" ? opt.label : undefined) ??
        opt.value,
    }));
  }, [options]);

  const hasValue = Boolean(value && value !== "");

  const handleClear = React.useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      onValueChange?.("" as T);
      onClear?.();
    },
    [onClear, onValueChange]
  );

  const selectNode = (
    <Select
      items={items}
      value={value ?? ""}
      onValueChange={(nextVal) => {
        onValueChange?.((nextVal ?? "") as T);
      }}
      disabled={disabled}
      name={name}
    >
      <SelectTrigger
        id={id}
        size={size}
        aria-label={ariaLabel}
        className={cn(
          "w-full justify-between text-left",
          clearable && hasValue && "pr-1.5",
          triggerClassName
        )}
      >
        <SelectValue placeholder={placeholder}>
          {(val) => {
            const matched = options.find((opt) => opt.value === val);
            if (matched) {
              return matched.label;
            }
            if (!val) {
              return placeholder;
            }
            return val;
          }}
        </SelectValue>
      </SelectTrigger>
      <SelectContent align="start">
        {options.map((opt) => (
          <SelectItem key={opt.value} value={opt.value} disabled={opt.disabled}>
            {opt.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );

  if (clearable) {
    return (
      <div className={cn("relative flex items-center gap-1.5", className)}>
        <div className="min-w-0 flex-1">{selectNode}</div>
        {hasValue && !disabled && (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className={cn(
              "shrink-0 text-muted-foreground hover:text-foreground",
              size === "sm" ? "size-7" : "size-8"
            )}
            aria-label="Clear selection"
            title="Clear selection"
            onClick={handleClear}
          >
            <X className="size-3.5" />
          </Button>
        )}
      </div>
    );
  }

  return <div className={cn("w-full", className)}>{selectNode}</div>;
}
