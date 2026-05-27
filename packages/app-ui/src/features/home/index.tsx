import { Sparkles } from 'lucide-react';

export function HomePage() {
  return (
    <div className="flex h-full flex-col items-center justify-center">
      <div className="bg-primary/10 text-primary mb-4 flex h-16 w-16 items-center justify-center rounded-2xl">
        <Sparkles className="h-8 w-8" />
      </div>
      <h1 className="text-foreground text-xl font-semibold">欢迎使用</h1>
      <p className="text-muted-foreground mt-2 text-sm">选择左侧功能开始使用</p>
    </div>
  );
}
