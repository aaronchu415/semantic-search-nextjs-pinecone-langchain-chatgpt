import { OpenAIEmbeddings } from "langchain/embeddings/openai";
import { RecursiveCharacterTextSplitter } from "langchain/text_splitter";
import { OpenAI } from "langchain/llms/openai";
import { ChatOpenAI } from "langchain/chat_models/openai";

import { loadQAStuffChain, LLMChain } from "langchain/chains";
import { Document } from "langchain/document";
import { timeout } from "./config";
import { PromptTemplate } from "langchain/prompts";
import { getEncoding } from "js-tiktoken";

const acorn = require("acorn");

export const queryPineconeVectorStoreContext = async (
  client,
  indexName,
  question,
  maxTokens = 6500
) => {
  // 1. Start query process
  console.log("Querying Pinecone vector store...");
  // 2. Retrieve the Pinecone index
  const index = client.Index(indexName);
  // 3. Create query embedding
  const queryEmbedding = await new OpenAIEmbeddings().embedQuery(question);
  // 4. Query Pinecone index and return top 10 matches
  let queryResponse = await index.query({
    queryRequest: {
      topK: 25,
      vector: queryEmbedding,
      includeMetadata: true,
      includeValues: true,
    },
  });

  let concatenatedPageContent = "";
  let totalTokens = 0;
  let countUsed = 0;

  // // 8. Extract and concatenate page content from matched documents
  for (let match of queryResponse.matches) {
    const pageContent = match.metadata.pageContent;

    // console.log("asdfadfsdf", [...acorn.tokenizer(pageContent)].length);
    // console.log(
    //   "bbbbsdfadfsdf",
    //   getEncoding("gpt2").encode(pageContent).length
    // );

    // const tokensInPageContent = pageContent.split(/\s+/).length; // Assumes tokens are separated by whitespace
    const tokensInPageContent = getEncoding("gpt2").encode(pageContent).length;

    if (totalTokens + tokensInPageContent <= maxTokens) {
      concatenatedPageContent += pageContent + "\n";
      totalTokens += tokensInPageContent;
      countUsed++;
    }
  }
  console.log("zz:concatenatedPageContent", concatenatedPageContent);
  console.log("totalToken", totalTokens);
  console.log("countUsed", countUsed);

  // 5. Log the number of matches
  console.log(`Found ${queryResponse.matches.length} matches...`);

  return concatenatedPageContent;
};

export const queryPineconeVectorStoreAndQueryLLM = async (
  client,
  indexName,
  question
) => {
  const concatenatedPageContent = queryPineconeVectorStoreContext(
    client,
    indexName,
    question
  );

  // 6. Log the question being asked
  console.log(`Asking question: ${question}...`);

  if (concatenatedPageContent) {
    // 7. Create an OpenAI instance and load the QAStuffChain
    // const llm = new OpenAI();
    const llm = new ChatOpenAI({ modelName: "gpt-4" });

    const prompt = PromptTemplate.fromTemplate(
      `You are a staff software engineering with 10 plus years working in FAANG companies.
       Your task today is to help developers questions about the codebase. Please answer the question below based on the codebase context provided.

       question: {question}

       codebase context: {context}
       `
    );

    const chain = new LLMChain({ llm, prompt });
    // const concatenatedPageContent = queryResponse.matches
    //   .map((match) => match.metadata.pageContent)
    //   .join("\n");

    // 9. Execute the chain with input documents and question

    const result = await chain
      .call({
        question,
        context: concatenatedPageContent,
      })
      .catch(console.log);

    // 10. Log the answer
    console.log(`Answer: ${result?.text}`);
    return result?.text || "";
  } else {
    // 11. Log that there are no matches, so GPT-3 will not be queried
    console.log("Since there are no matches, GPT-3 will not be queried.");
  }
};
export const createPineconeIndex = async (
  client,
  indexName,
  vectorDimension
) => {
  // 1. Initiate index existence check
  console.log(`Checking "${indexName}"...`);
  // 2. Get list of existing indexes
  const existingIndexes = await client.listIndexes();
  // 3. If index doesn't exist, create it
  if (!existingIndexes.includes(indexName)) {
    // 4. Log index creation initiation
    console.log(`Creating "${indexName}"...`);
    // 5. Create index
    await client.createIndex({
      createRequest: {
        name: indexName,
        dimension: vectorDimension,
        metric: "cosine",
      },
    });
    // 6. Log successful creation
    console.log(
      `Creating index.... please wait for it to finish initializing.`
    );
    // 7. Wait for index initialization
    await new Promise((resolve) => setTimeout(resolve, timeout));
  } else {
    // 8. Log if index already exists
    console.log(`"${indexName}" already exists.`);
  }
};

export const updatePinecone = async (client, indexName, docs) => {
  console.log("Retrieving Pinecone index...");
  // 1. Retrieve Pinecone index
  const index = client.Index(indexName);
  // 2. Log the retrieved index name
  console.log(`Pinecone index retrieved: ${indexName}`);
  // 3. Process each document in the docs array
  for (const doc of docs) {
    console.log(`Processing document: ${doc.metadata.source}`);
    const txtPath = doc.metadata.source;
    const text = doc.pageContent;
    // 4. Create RecursiveCharacterTextSplitter instance
    const textSplitter = new RecursiveCharacterTextSplitter({
      chunkSize: 5000,
    });
    console.log("Splitting text into chunks...");
    // 5. Split text into chunks (documents)
    const chunks = await textSplitter.createDocuments([text]);
    console.log(`Text split into ${chunks.length} chunks`);
    console.log(
      `Calling OpenAI's Embedding endpoint documents with ${chunks.length} text chunks ...`
    );
    // 6. Create OpenAI embeddings for documents
    const embeddingsArrays = await new OpenAIEmbeddings().embedDocuments(
      chunks.map((chunk) => chunk.pageContent.replace(/\n/g, " "))
    );
    console.log("Finished embedding documents");
    console.log(
      `Creating ${chunks.length} vectors array with id, values, and metadata...`
    );
    // 7. Create and upsert vectors in batches of 100
    const batchSize = 100;
    let batch: any = [];
    for (let idx = 0; idx < chunks.length; idx++) {
      const chunk = chunks[idx];
      const vector = {
        id: `${txtPath}_${doc.metadata?.loc?.pageNumber || "0"}_${idx}`,
        values: embeddingsArrays[idx],
        metadata: {
          ...chunk.metadata,
          loc: JSON.stringify(chunk.metadata.loc),
          pageContent: `--${txtPath.split("/").pop()}-- ${chunk.pageContent}`,
          txtPath: txtPath,
        },
      };
      batch = [...batch, vector];
      // When batch is full or it's the last item, upsert the vectors
      if (batch.length === batchSize || idx === chunks.length - 1) {
        console.log("zzzzzz: uploading batch", batch);
        await index.upsert({
          upsertRequest: {
            vectors: batch,
          },
        });
        // Empty the batch
        batch = [];
      }
    }
    // 8. Log the number of vectors updated
    console.log(`Pinecone index updated with ${chunks.length} vectors`);
  }
};
