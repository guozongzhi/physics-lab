import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export type VariantConfig<V extends Record<string, Record<string, string>>> = {
  variants?: V;
  defaultVariants?: { [K in keyof V]?: keyof V[K] };
  compoundVariants?: Array<{ [K in keyof V]?: keyof V[K] } & { className: string }>;
};

export type VariantProps<T extends (...args: never[]) => string> = Parameters<T>[0];

export function cva<V extends Record<string, Record<string, string>>>(
  baseClass?: string,
  config?: VariantConfig<V>
) {
  return (props?: { [K in keyof V]?: keyof V[K] } & { className?: string }): string => {
    if (!config) return cn(baseClass, props?.className);

    const { variants, defaultVariants, compoundVariants } = config;
    const resolvedClasses: string[] = [baseClass || ""];

    if (variants) {
      for (const variantKey in variants) {
        const propValue = props?.[variantKey] ?? defaultVariants?.[variantKey];
        if (propValue && variants[variantKey]?.[propValue as string]) {
          resolvedClasses.push(variants[variantKey][propValue as string]);
        }
      }
    }

    if (compoundVariants && props) {
      for (const cv of compoundVariants) {
        const matches = Object.entries(cv).every(([k, v]) => {
          if (k === "className") return true;
          const currentVal = props[k] ?? defaultVariants?.[k];
          return currentVal === v;
        });
        if (matches) resolvedClasses.push(cv.className);
      }
    }

    if (props?.className) {
      resolvedClasses.push(props.className);
    }

    return cn(...resolvedClasses);
  };
}
