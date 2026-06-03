import React from 'react';
import {
  TouchableOpacity,
  type TouchableOpacityProps,
  type GestureResponderEvent,
} from 'react-native';

type ButtonVariant = 'default' | 'outline' | 'ghost';
type ButtonSize = 'sm' | 'default' | 'lg';

interface ButtonProps extends Omit<TouchableOpacityProps, 'onPress'> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
  children: React.ReactNode;
  onPress?: (event: GestureResponderEvent) => void;
}

const variantClass: Record<ButtonVariant, string> = {
  default: 'bg-primary active:bg-primary/80',
  outline: 'border border-border bg-transparent active:bg-secondary',
  ghost: 'bg-transparent active:bg-secondary',
};

const sizeClass: Record<ButtonSize, string> = {
  sm: 'px-3 py-1.5 rounded-md',
  default: 'px-4 py-2.5 rounded-lg',
  lg: 'px-6 py-3.5 rounded-xl',
};

export function Button({
  variant = 'default',
  size = 'default',
  children,
  className,
  ...props
}: ButtonProps) {
  return (
    <TouchableOpacity
      className={`flex-row items-center justify-center ${variantClass[variant]} ${sizeClass[size]} ${className ?? ''}`}
      activeOpacity={0.7}
      {...props}
    >
      {children}
    </TouchableOpacity>
  );
}
