import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Popover, PopoverContent, PopoverTrigger } from '../components/Popover';

describe('Popover', () => {
  it('renders trigger', () => {
    render(
      <Popover open onOpenChange={() => {}}>
        <PopoverTrigger>Trigger</PopoverTrigger>
        <PopoverContent>Content</PopoverContent>
      </Popover>,
    );
    expect(screen.getByText('Trigger')).toBeInTheDocument();
    expect(screen.getByText('Content')).toBeInTheDocument();
  });
});
