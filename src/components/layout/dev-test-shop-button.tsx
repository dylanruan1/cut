"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { FlaskConical } from "lucide-react";
import { createDevTestShop2 } from "@/actions/auth";
import { DEV_TEST_SHOP_2_NAME } from "@/lib/shop-constants";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";

interface DevTestShopButtonProps {
  hasTestShop2: boolean;
}

export function DevTestShopButton({ hasTestShop2 }: DevTestShopButtonProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [created, setCreated] = useState(hasTestShop2);

  function handleCreate() {
    startTransition(async () => {
      const result = await createDevTestShop2();
      if ("error" in result && result.error) {
        toast({
          title: "Could not create test shop",
          description: result.error,
          variant: "destructive",
        });
        return;
      }
      setCreated(true);
      toast({
        title: result.created ? "Test shop created" : "Test shop already exists",
        description: result.created
          ? `${DEV_TEST_SHOP_2_NAME} is ready. Use the shop switcher to test multi-shop separation.`
          : `${DEV_TEST_SHOP_2_NAME} already exists for your account.`,
      });
      router.refresh();
    });
  }

  if (created) {
    return (
      <p className="text-xs text-muted-foreground px-1">
        {DEV_TEST_SHOP_2_NAME} is available in the shop switcher.
      </p>
    );
  }

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className="w-full justify-start gap-2 text-xs h-8"
      onClick={handleCreate}
      disabled={pending}
    >
      <FlaskConical className="h-3.5 w-3.5" />
      {pending ? "Creating…" : `Create ${DEV_TEST_SHOP_2_NAME}`}
    </Button>
  );
}
