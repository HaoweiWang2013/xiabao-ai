import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Textarea } from '../components/Textarea';

describe('Textarea', () => {
  it('renders a textarea element', () => {
    const { container } = render(<Textarea />);
    expect(screen.getByRole('textbox')).toBeInTheDocument();
    expect(container.firstChild).toMatchSnapshot();
  });

  it('renders with placeholder', () => {
    render(<Textarea placeholder="Type here" />);
    expect(screen.getByPlaceholderText('Type here')).toBeInTheDocument();
  });

  it('renders with value', () => {
    render(<Textarea value="content" onChange={() => {}} />);
    expect(screen.getByRole('textbox')).toHaveValue('content');
  });

  it('is disabled', () => {
    render(<Textarea disabled />);
    expect(screen.getByRole('textbox')).toBeDisabled();
  });

  it('merges className', () => {
    render(<Textarea className="custom-area" />);
    expect(screen.getByRole('textbox')).toHaveClass('custom-area');
  });
});
