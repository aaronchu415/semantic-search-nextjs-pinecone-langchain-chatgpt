import { NextRequest, NextResponse } from "next/server";
import { PineconeClient } from "@pinecone-database/pinecone";
import { queryPineconeVectorStoreContext } from "../../../utils";
import { indexName } from "../../../config";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const client = new PineconeClient();
  await client.init({
    apiKey: process.env.PINECONE_API_KEY || "",
    environment: process.env.PINECONE_ENVIRONMENT || "",
  });

  const context = body.query
    ? await queryPineconeVectorStoreContext(
        client,
        indexName,
        body.query,
        10000
      )
    : "";

  return NextResponse.json({
    data: context,
  });
}
