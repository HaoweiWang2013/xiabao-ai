import { Puzzle } from 'lucide-react';

export function MiniAppPage() {
  return (
    <div className="flex h-full flex-col items-center justify-center">
      <div className="bg-primary/10 text-primary mb-4 flex h-16 w-16 items-center justify-center rounded-2xl">
        <Puzzle className="h-8 w-8" />
      </div>
      <h1 className="text-foreground text-xl font-semibold">小程序</h1>
      <p className="text-muted-foreground mt-2 text-sm">小程序功能即将上线</p>
    </div>
  );
}
