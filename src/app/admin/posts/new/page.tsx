import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { PostEditor } from "@/components/post-editor";

export const metadata = { title: "New post" };

export default function NewPostPage() {
  return (
    <div className="mx-auto max-w-3xl px-6 pb-24 pt-28">
      <Link
        href="/admin"
        className="mb-6 inline-flex items-center gap-1.5 text-sm text-sand-100/70 hover:text-ember-400"
      >
        <ArrowLeft className="size-4" /> Dashboard
      </Link>
      <h1 className="mb-8 font-display text-4xl font-semibold">New post</h1>
      <PostEditor />
    </div>
  );
}
