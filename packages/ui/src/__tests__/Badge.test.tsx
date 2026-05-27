import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Badge } from '../components/Badge';

describe('Badge', () => {
  it('renders with default variant', () => {
    const { container } = render(<Badge>New</Badge>);
    expect(screen.getByText('New')).toBeInTheDocument();
    expect(container.firstChild).toMatchSnapshot();
  });

  it('renders secondary variant', () => {
    render(<Badge variant="secondary">Beta</Badge>);
    expect(screen.getByText('Beta')).toBeInTheDocument();
  });

  it('renders outline variant', () => {
    render(<Badge variant="outline">Draft</Badge>);
    expect(screen.getByText('Draft')).toBeInTheDocument();
  });

  it('renders success variant', () => {
    render(<Badge variant="success">Done</Badge>);
    expect(screen.getByText('Done')).toBeInTheDocument();
  });

  it('renders warning variant', () => {
    render(<Badge variant="warning">Pending</Badge>);
    expect(screen.getByText('Pending')).toBeInTheDocument();
  });

  it('renders destructive variant', () => {
    render(<Badge variant="destructive">Error</Badge>);
    expect(screen.getByText('Error')).toBeInTheDocument();
  });

  it('merges className', () => {
    render(<Badge className="custom">Tag</Badge>);
    expect(screen.getByText('Tag')).toHaveClass('custom');
  });
});
