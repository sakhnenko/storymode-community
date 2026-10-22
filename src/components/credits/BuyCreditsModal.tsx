import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ShoppingBag } from "@/components/ui/icons";
import { CREDIT_PACKS } from "@/hooks/useUserCredits";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface BuyCreditsModalProps {
  open: boolean;
  onClose: () => void;
}

export function BuyCreditsModal({ open, onClose }: BuyCreditsModalProps) {
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const { toast } = useToast();

  const buy = async (packId: string) => {
    setLoadingId(packId);
    try {
      const { data, error } = await supabase.functions.invoke("buy-credits", { body: { pack: packId } });
      if (error) throw error;
      if (data?.url) {
        window.open(data.url, "_blank");
        onClose();
      }
    } catch (e: any) {
      toast({ title: "Couldn't start checkout", description: e.message, variant: "destructive" });
    } finally {
      setLoadingId(null);
    }
  };

  const packs = CREDIT_PACKS;

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="sm:max-w-md border-border bg-background">
        <DialogHeader className="text-center items-center">
          <div className="mx-auto w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center mb-2">
            <ShoppingBag weight="duotone" className="w-6 h-6 text-primary" />
          </div>
          <DialogTitle className="text-lg font-mono font-normal">Buy more credits</DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground">
            Purchased credits never expire and are used after your monthly allowance runs out.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-2 mt-4">
          {packs.map(p => (
            <div key={p.id} className="flex items-center justify-between rounded-xl border border-border bg-muted/20 p-4">
              <div>
                <div className="text-sm font-medium">{p.credits.toLocaleString()} credits</div>
                <div className="text-xs text-muted-foreground">One-time purchase</div>
              </div>
              <Button size="sm" onClick={() => buy(p.id)} disabled={loadingId === p.id} className="font-mono">
                {loadingId === p.id ? "…" : p.price}
              </Button>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}