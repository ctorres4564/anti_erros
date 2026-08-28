import { Loader2 } from 'lucide-react';

export default function AppLoading() {
  return (
    <div role="status" className="flex min-h-[55vh] items-center justify-center gap-3 text-sm text-muted-foreground">
      <Loader2 className="h-5 w-5 animate-spin text-primary" aria-hidden="true" />
      Carregando sua área de análises…
    </div>
  );
}
