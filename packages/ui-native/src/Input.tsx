import React from 'react';
import { TextInput, type TextInputProps } from 'react-native';

interface InputProps extends TextInputProps {
  placeholder?: string;
  secureTextEntry?: boolean;
  multiline?: boolean;
}

export function Input({
  className,
  placeholder,
  secureTextEntry,
  multiline,
  ...props
}: InputProps) {
  return (
    <TextInput
      className={`border-border bg-card text-foreground placeholder:text-muted-foreground rounded-lg border px-3 py-2.5 text-base leading-5 ${multiline ? 'min-h-[80px]' : ''} ${className ?? ''}`}
      placeholder={placeholder}
      placeholderTextColor="#9ca3af"
      secureTextEntry={secureTextEntry}
      multiline={multiline}
      textAlignVertical={multiline ? 'top' : 'center'}
      {...props}
    />
  );
}
