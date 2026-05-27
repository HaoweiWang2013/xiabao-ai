import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Input } from '../components/Input';

describe('Input', () => {
  it('renders an input element', () => {
    const { container } = render(<Input />);
    expect(screen.getByRole('textbox')).toBeInTheDocument();
    expect(container.firstChild).toMatchSnapshot();
  });

  it('renders with placeholder', () => {
    render(<Input placeholder="Enter your name" />);
    expect(screen.getByPlaceholderText('Enter your name')).toBeInTheDocument();
  });

  it('renders with value', () => {
    render(<Input value="hello" onChange={() => {}} />);
    expect(screen.getByRole('textbox')).toHaveValue('hello');
  });

  it('is disabled', () => {
    render(<Input disabled />);
    expect(screen.getByRole('textbox')).toBeDisabled();
  });

  it('merges className', () => {
    render(<Input className="custom-input" />);
    expect(screen.getByRole('textbox')).toHaveClass('custom-input');
  });
});
