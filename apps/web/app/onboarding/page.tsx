import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { createWorkspace } from "@/actions/onboarding";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default async function OnboardingPage() {
  const ctx = await requireUser();
  if (ctx.activeTenantId) redirect("/dashboard");

  return (
    <div className="flex min-h-screen items-center justify-center bg-secondary p-6">
      <Card className="w-full max-w-md">
        <CardHeader>
          <div className="overline text-muted-foreground">Get started</div>
          <CardTitle className="text-2xl">Create your workspace</CardTitle>
        </CardHeader>
        <CardContent>
          <form action={createWorkspace} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="name">Workspace name</Label>
              <Input id="name" name="name" placeholder="Crysta IVF" required />
            </div>
            <Button type="submit" className="w-full" data-testid="create-workspace">
              Create workspace
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
