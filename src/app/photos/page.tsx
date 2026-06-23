import { permanentRedirect } from "next/navigation";

// The photo map merged into the journey map. Keep the old URL working.
export default function PhotosPage() {
  permanentRedirect("/map");
}
