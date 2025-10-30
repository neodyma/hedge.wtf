import { HelpCircle } from "lucide-react"

import { Button } from "@/components/ui/button"
import { useTutorial } from "@/hooks/useTutorial"

export default function TutorialFab() {
  const { restart } = useTutorial()
  return (
    <Button
      aria-label="Restart tutorial"
      className="text-muted-foreground border-border bg-card hover:bg-card/80 hover:text-muted-foreground fixed right-6 bottom-6 z-[900] h-10 w-10 rounded-full p-0"
      onClick={restart}
      variant="outline"
    >
      <HelpCircle className="h-5 w-5" />
    </Button>
  )
}
