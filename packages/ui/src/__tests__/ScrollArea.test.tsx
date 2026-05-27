import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ScrollArea } from '../components/ScrollArea';

describe('ScrollArea', () => {
  it('renders with children', () => {
    const { container } = render(
      <ScrollArea style={{ height: 200 }}>
        <div>Item 1</div>
        <div>Item 2</div>
        <div>Item 3</div>
      </ScrollArea>,
    );
    expect(screen.getByText('Item 1')).toBeInTheDocument();
    expect(screen.getByText('Item 2')).toBeInTheDocument();
    expect(screen.getByText('Item 3')).toBeInTheDocument();
    expect(container.firstChild).toMatchSnapshot();
  });
});
