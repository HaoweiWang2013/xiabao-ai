import React from 'react';
import { View, type ViewProps } from 'react-native';

interface CardProps extends ViewProps {
  padding?: 'none' | 'sm' | 'default' | 'lg';
  rounded?: 'none' | 'default' | 'lg';
  children: React.ReactNode;
}

const paddingClass: Record<string, string> = {
  none: 'p-0',
  sm: 'p-3',
  default: 'p-4',
  lg: 'p-6',
};

const roundedClass: Record<string, string> = {
  none: 'rounded-none',
  default: 'rounded-lg',
  lg: 'rounded-xl',
};

export function Card({
  padding = 'default',
  rounded = 'default',
  className,
  children,
  ...props
}: CardProps) {
  return (
    <View
      className={`border-border bg-card border ${paddingClass[padding]} ${roundedClass[rounded]} ${className ?? ''}`}
      {...props}
    >
      {children}
    </View>
  );
}
