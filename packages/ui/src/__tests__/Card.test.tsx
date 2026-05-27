import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '../components/Card';

describe('Card', () => {
  it('renders card with children', () => {
    const { container } = render(<Card>Content</Card>);
    expect(screen.getByText('Content')).toBeInTheDocument();
    expect(container.firstChild).toMatchSnapshot();
  });

  it('renders CardHeader', () => {
    render(<CardHeader>Header</CardHeader>);
    expect(screen.getByText('Header')).toBeInTheDocument();
  });

  it('renders CardTitle', () => {
    render(<CardTitle>Title</CardTitle>);
    expect(screen.getByText('Title')).toBeInTheDocument();
  });

  it('renders CardDescription', () => {
    render(<CardDescription>Desc</CardDescription>);
    expect(screen.getByText('Desc')).toBeInTheDocument();
  });

  it('renders CardContent', () => {
    render(<CardContent>Body</CardContent>);
    expect(screen.getByText('Body')).toBeInTheDocument();
  });

  it('renders CardFooter', () => {
    render(<CardFooter>Footer</CardFooter>);
    expect(screen.getByText('Footer')).toBeInTheDocument();
  });

  it('renders full card', () => {
    render(
      <Card>
        <CardHeader>
          <CardTitle>Hello</CardTitle>
          <CardDescription>World</CardDescription>
        </CardHeader>
        <CardContent>Body text</CardContent>
        <CardFooter>Footer text</CardFooter>
      </Card>,
    );
    expect(screen.getByText('Hello')).toBeInTheDocument();
    expect(screen.getByText('World')).toBeInTheDocument();
    expect(screen.getByText('Body text')).toBeInTheDocument();
    expect(screen.getByText('Footer text')).toBeInTheDocument();
  });
});
