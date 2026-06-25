"use client";
// Anonymous per-browser reader id, shared by comments, likes, and viewer push
// subscriptions so a reply/like can be routed back to the reader who owns a
// comment. Created lazily on first use; never leaves this browser.
const VID_KEY = "sojourn:vid";

export function visitorToken(): string {
  if (typeof window === "undefined") return "";
  let t = localStorage.getItem(VID_KEY);
  if (!t) {
    t = crypto.randomUUID();
    localStorage.setItem(VID_KEY, t);
  }
  return t;
}
