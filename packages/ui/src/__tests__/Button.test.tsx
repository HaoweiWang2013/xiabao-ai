import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Button } from '../components/Button';

describe('Button', () => {
  it('renders with default variant', () => {
    const { container } = render(<Button>Click</Button>);
    expect(screen.getByRole('button')).toHaveTextContent('Click');
    expect(container.firstChild).toMatchSnapshot();
  });

  it('renders secondary variant', () => {
    render(<Button variant="secondary">Save</Button>);
    expect(screen.getByRole('button')).toHaveTextContent('Save');
  });

  it('renders outline variant', () => {
    render(<Button variant="outline">Cancel</Button>);
    expect(screen.getByRole('button')).toHaveTextContent('Cancel');
  });

  it('renders ghost variant', () => {
    render(<Button variant="ghost">Settings</Button>);
    expect(screen.getByRole('button')).toHaveTextContent('Settings');
  });

  it('renders destructive variant', () => {
    render(<Button variant="destructive">Delete</Button>);
    expect(screen.getByRole('button')).toHaveTextContent('Delete');
  });

  it('renders sm size', () => {
    render(<Button size="sm">Small</Button>);
    expect(screen.getByRole('button')).toHaveTextContent('Small');
  });

  it('renders lg size', () => {
    render(<Button size="lg">Large</Button>);
    expect(screen.getByRole('button')).toHaveTextContent('Large');
  });

  it('renders icon size', () => {
    render(<Button size="icon">X</Button>);
    expect(screen.getByRole('button')).toHaveTextContent('X');
  });

  it('merges className', () => {
    render(<Button className="extra">Styled</Button>);
    expect(screen.getByRole('button')).toHaveClass('extra');
  });

  it('is disabled', () => {
    render(<Button disabled>Disabled</Button>);
    expect(screen.getByRole('button')).toBeDisabled();
  });
});
