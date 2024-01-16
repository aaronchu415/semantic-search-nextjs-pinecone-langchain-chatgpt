import { NextResponse } from "next/server";
import { PineconeClient } from "@pinecone-database/pinecone";
import { TextLoader } from "langchain/document_loaders/fs/text";
import { DirectoryLoader } from "langchain/document_loaders/fs/directory";
import { PDFLoader } from "langchain/document_loaders/fs/pdf";
import { createPineconeIndex, updatePinecone } from "../../../utils";
import { indexName } from "../../../config";

export async function POST() {
  const loader = new DirectoryLoader("./documents", {
    ".txt": (path) => new TextLoader(path),
    ".js": (path) => new TextLoader(path),
    ".jsx": (path) => new TextLoader(path),
    ".ts": (path) => new TextLoader(path),
    ".tsx": (path) => new TextLoader(path),
    ".yml": (path) => new TextLoader(path),
    ".json": (path) => new TextLoader(path),
    ".md": (path) => new TextLoader(path),
    ".pdf": (path) => new PDFLoader(path),
  });

  let docs = await loader.load();
  const vectorDimensions = 1536;

  const client = new PineconeClient();
  await client.init({
    apiKey: process.env.PINECONE_API_KEY || "",
    environment: process.env.PINECONE_ENVIRONMENT || "",
  });

  docs = docs.map((doc) => {
    doc.pageContent = doc.pageContent?.replace(new RegExp("\r?\n", "g"), " ");
    return doc;
  });
  // console.log("docs[100]", docs[100].metadata.loc.pageNumber);
  // await client.Index(indexName).delete1({
  //   deleteAll: true,
  //   namespace: "",
  // });
  // return NextResponse.json({
  //   data: "successfully created index and loaded data into pinecone...",
  // });
  try {
    await createPineconeIndex(client, indexName, vectorDimensions);
    await updatePinecone(client, indexName, docs);
  } catch (err) {
    console.log("error: ", err);
  }

  return NextResponse.json({
    data: "successfully created index and loaded data into pinecone...",
  });
}
