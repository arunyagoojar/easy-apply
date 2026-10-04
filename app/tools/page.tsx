import { redirect } from "next/navigation";

// The tools directory now lives on the home page.
export default function ToolsDirectoryPage() {
  redirect("/");
}
