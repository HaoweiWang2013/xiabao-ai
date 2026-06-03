import React from 'react';
import { Text as RNText, type TextProps as RNTextProps } from 'react-native';

type TextSize = 'xs' | 'sm' | 'default' | 'lg' | 'xl' | '2xl';
type TextWeight = 'normal' | 'medium' | 'semibold' | 'bold';

interface TextProps extends RNTextProps {
  size?: TextSize;
  weight?: TextWeight;
  color?: string;
  className?: string;
  children: React.ReactNode;
}

const sizeClass: Record<TextSize, string> = {
  xs: 'text-xs',
  sm: 'text-sm',
  default: 'text-base',
  lg: 'text-lg',
  xl: 'text-xl',
  '2xl': 'text-2xl',
};

const weightClass: Record<TextWeight, string> = {
  normal: 'font-normal',
  medium: 'font-medium',
  semibold: 'font-semibold',
  bold: 'font-bold',
};

export function Text({
  size = 'default',
  weight = 'normal',
  color = 'text-foreground',
  className,
  children,
  ...props
}: TextProps) {
  return (
    <RNText
      className={`${sizeClass[size]} ${weightClass[weight]} ${color} ${className ?? ''}`}
      {...props}
    >
      {children}
    </RNText>
  );
}
