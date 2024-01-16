"use client";
import { useState } from "react";

export default function Home() {
  const [query, setQuery] = useState("");
  const [result, setResult] = useState("");
  const [loading, setLoading] = useState(false);
  async function createIndexAndEmbeddings() {
    try {
      const result = await fetch("/api/setup", {
        method: "POST",
      });
      const json = await result.json();
      console.log("result: ", json);
    } catch (err) {
      console.log("err:", err);
    }
  }
  async function sendQuery(type = "read") {
    if (!query) return;
    setResult("");
    setLoading(true);
    try {
      const result = await fetch(`/api/${type}`, {
        method: "POST",
        body: JSON.stringify(query),
      });
      const json = await result.json();
      setResult(json.data);
      console.log("json", json.data);
      setLoading(false);
    } catch (err) {
      console.log("err:", err);
      setLoading(false);
    }
  }
  return (
    <main className="flex flex-col items-center justify-between p-24">
      <input
        className="text-black px-2 py-1 w-3/4"
        onChange={(e) => setQuery(e.target.value)}
      />
      <button
        className="px-7 py-1 rounded-2xl bg-white text-black mt-2 mb-2"
        onClick={() => sendQuery("read")}
      >
        Ask AI
      </button>
      <button
        className="px-7 py-1 rounded-2xl bg-white text-black mt-2 mb-2"
        onClick={() => sendQuery("context")}
      >
        Ask Content
      </button>
      {loading && <p>Asking AI ...</p>}
      {result && <pre className="w-3/4 whitespace-pre-wrap">{result}</pre>}
      {/* consider removing this button from the UI once the embeddings are created ... */}
      {process.env.NODE_ENV === "development" && (
        <button onClick={createIndexAndEmbeddings}>
          Create index and embeddings
        </button>
      )}
    </main>
  );
}
