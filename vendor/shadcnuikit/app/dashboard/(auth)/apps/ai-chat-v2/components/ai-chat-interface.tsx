"use client";

import React, { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  ArrowUpIcon,
  BrainIcon,
  DribbbleIcon,
  GlobeIcon,
  MicIcon,
  Paperclip,
  SquareIcon,
  ThumbsDownIcon,
  ThumbsUpIcon,
  X
} from "lucide-react";
import { CodeIcon, CopyIcon } from "@radix-ui/react-icons";
import Lottie from "lottie-react";

import {
  Input,
  PromptInputAction,
  PromptInputActions,
  PromptInputTextarea
} from "@/components/ui/custom/prompt/input";
import { Button } from "@/components/ui/button";
import { Suggestion } from "@/components/ui/custom/prompt/suggestion";
import { ChatContainer } from "@/components/ui/custom/prompt/chat-container";
import {
  Message,
  MessageAction,
  MessageActions,
  MessageContent
} from "@/components/ui/custom/prompt/message";
import { Markdown } from "@/components/ui/custom/prompt/markdown";
import { PromptLoader } from "@/components/ui/custom/prompt/loader";
import { PromptScrollButton } from "@/components/ui/custom/prompt/scroll-button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import { AIUpgradePricingModal } from "./ai-upgrade-modal";

import aiSphereAnimation from "../ai-sphere-animation.json";
import conversations from "../data.json";

export default function AIChatInterface() {
  const [prompt, setPrompt] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const uploadInputRef = useRef<HTMLInputElement>(null);
  const [activeCategory, setActiveCategory] = useState("");

  const [isFirstResponse, setIsFirstResponse] = useState(false); // Understanding whether the conversation has started or not

  const [isStreaming, setIsStreaming] = useState(false);
  const streamIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const streamContentRef = useRef("");
  const containerRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const params = useParams<{ id: string }>();

  const selectedConversation = conversations.find((i) => i.id === params.id);

  const [messages, setMessages] = React.useState<
    { id: number | string; role: string; content: string; files?: File[] }[]
  >([]);

  useEffect(() => {
    if (selectedConversation) {
      setMessages(selectedConversation.messages);
      setIsFirstResponse(true);
    }
  }, [selectedConversation]);

  const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

  const streamResponse = async () => {
    if (isStreaming) return;

    if (prompt.trim() || files.length > 0) {
      setIsFirstResponse(true);
      setIsStreaming(true);

      const newMessageId = messages.length + 1;
      setMessages((prev) => [
        ...prev,
        {
          id: newMessageId,
          role: "user",
          content: prompt,
          files: files
        }
      ]);

      setPrompt("");
      setFiles([]);

      await delay(2000);

      const fullResponse =
        "Fetching data in Next.js using getServerSideProps is straightforward. Here's a basic example:\n\n```ts\nexport async function getServerSideProps() {\n  const res = await fetch('https://api.example.com/data');\n  const data = await res.json();\n\n  return {\n    props: { data },\n  };\n}\n```\n\nThis function runs on the server before rendering the page and provides `data` as props.\nIt's ideal for dynamic data that changes often.\n\nWould you like to see an example using `getStaticProps` instead?";

      setMessages((prev) => [
        ...prev,
        {
          id: newMessageId + 1,
          role: "assistant",
          content: ""
        }
      ]);

      let charIndex = 0;
      streamContentRef.current = "";

      streamIntervalRef.current = setInterval(() => {
        if (charIndex < fullResponse.length) {
          streamContentRef.current += fullResponse[charIndex];
          setMessages((prev) =>
            prev.map((msg) =>
              msg.id === newMessageId + 1 ? { ...msg, content: streamContentRef.current } : msg
            )
          );
          charIndex++;
        } else {
          clearInterval(streamIntervalRef.current!);
          setIsStreaming(false);
        }
      }, 5);
    }
  };

  React.useEffect(() => {
    return () => {
      if (streamIntervalRef.current) {
        clearInterval(streamIntervalRef.current);
      }
    };
  }, []);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files) {
      const newFiles = Array.from(event.target.files);
      setFiles((prev) => [...prev, ...newFiles]);
    }
  };

  const handleRemoveFile = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
    if (uploadInputRef?.current) {
      uploadInputRef.current.value = "";
    }
  };

  const FileListItem = ({
    file,
    dismiss = true,
    index
  }: {
    file: File;
    dismiss?: boolean;
    index: number;
  }) => (
    <div className="bg-muted flex items-center gap-2 rounded-lg px-3 py-2 text-sm">
      <Paperclip className="size-4" />
      <span className="max-w-[120px] truncate">{file.name}</span>
      {dismiss && (
        <button
          onClick={() => handleRemoveFile(index)}
          className="hover:bg-secondary/50 rounded-full p-1">
          <X className="size-4" />
        </button>
      )}
    </div>
  );

  const activeCategoryData = suggestionGroups.find((group) => group.label === activeCategory);

  const showCategorySuggestions = activeCategory !== "";

  return (
    <div className="mx-auto flex h-full w-full max-w-4xl flex-col items-center justify-center space-y-4 lg:p-4">
      <ChatContainer
        className={cn("relative w-full flex-1 space-y-4 pe-2 pt-10 md:pt-0", {
          hidden: !isFirstResponse
        })}
        ref={containerRef}
        scrollToRef={bottomRef}>
        {messages.map((message, index) => {
          const isAssistant = message.role === "assistant";
          const isLastMessage = index === messages.length - 1;

          return (
            <Message
              key={message.id}
              className={message.role === "user" ? "justify-end" : "justify-start"}>
              <div
                className={cn("max-w-[85%] flex-1 sm:max-w-[75%]", {
                  "justify-end text-end": !isAssistant
                })}>
                {isAssistant ? (
                  <div className="space-y-2">
                    <div className="bg-muted text-foreground prose rounded-lg border p-4">
                      <Markdown className={"space-y-4"}>{message.content}</Markdown>
                    </div>
                    <MessageActions
                      className={cn(
                        "flex gap-0 opacity-0 transition-opacity duration-150 group-hover:opacity-100",
                        isLastMessage && "opacity-100"
                      )}>
                      <MessageAction tooltip="Copy" delayDuration={100}>
                        <Button variant="ghost" size="icon" className="rounded-full">
                          <CopyIcon />
                        </Button>
                      </MessageAction>
                      <MessageAction tooltip="Upvote" delayDuration={100}>
                        <Button variant="ghost" size="icon" className="rounded-full">
                          <ThumbsUpIcon />
                        </Button>
                      </MessageAction>
                      <MessageAction tooltip="Downvote" delayDuration={100}>
                        <Button variant="ghost" size="icon" className="rounded-full">
                          <ThumbsDownIcon />
                        </Button>
                      </MessageAction>
                    </MessageActions>
                  </div>
                ) : message?.files && message.files.length > 0 ? (
                  <div className="flex flex-col items-end space-y-2">
                    <div className="flex flex-wrap justify-end gap-2">
                      {message.files.map((file, index) => (
                        <FileListItem key={index} index={index} file={file} dismiss={false} />
                      ))}
                    </div>
                    {message.content ? (
                      <>
                        <MessageContent className="bg-primary text-primary-foreground inline-flex">
                          {message.content}
                        </MessageContent>
                      </>
                    ) : null}
                  </div>
                ) : (
                  <MessageContent className="bg-primary text-primary-foreground inline-flex text-start">
                    {message.content}
                  </MessageContent>
                )}
              </div>
            </Message>
          );
        })}

        {isStreaming && (
          <div className="ps-2">
            <PromptLoader variant="pulse-dot" />
          </div>
        )}
      </ChatContainer>

      <div className="fixed right-4 bottom-4">
        <PromptScrollButton
          containerRef={containerRef}
          scrollRef={bottomRef}
          className="shadow-sm"
        />
      </div>

      {/* Welcome message */}
      {!isFirstResponse && (
        <div className="mb-10">
          <div className="mx-auto -mt-36 hidden w-72 mask-b-from-100% mask-radial-[50%_50%] mask-radial-from-0% md:block">
            <Lottie className="w-full" animationData={aiSphereAnimation} loop autoplay />
          </div>

          <h1 className="text-center text-2xl leading-normal font-medium lg:text-4xl">
            Good Morning, Toby <br /> How Can I{" "}
            <span className="bg-gradient-to-r from-purple-400 to-indigo-300 bg-clip-text text-transparent">
              Assist You Today?
            </span>
          </h1>
        </div>
      )}
      {/* Welcome message */}

      <div className="bg-primary/10 w-full rounded-2xl p-1 pt-0">
        <div className="flex gap-2 px-4 py-2 text-xs">
          Use our faster AI on Pro Plan <span>&bull;</span>{" "}
          <AIUpgradePricingModal>
            <Link href="#" className="hover:underline">
              Upgrade
            </Link>
          </AIUpgradePricingModal>
        </div>
        <Input
          value={prompt}
          onValueChange={setPrompt}
          onSubmit={streamResponse}
          className="w-full overflow-hidden border-0 p-0 shadow-none">
          {files.length > 0 && (
            <div className="flex flex-wrap gap-2 pb-2">
              {files.map((file, index) => (
                <FileListItem key={index} index={index} file={file} />
              ))}
            </div>
          )}

          <PromptInputTextarea placeholder="Ask me anything..." className="min-h-auto p-4" />

          <PromptInputActions className="flex items-center justify-between gap-2 p-3">
            <div className="flex items-center gap-2">
              <PromptInputAction tooltip="Attach files">
                <label
                  htmlFor="file-upload"
                  className="hover:bg-secondary-foreground/10 flex size-8 cursor-pointer items-center justify-center rounded-2xl">
                  <input
                    type="file"
                    multiple
                    onChange={handleFileChange}
                    className="hidden"
                    id="file-upload"
                  />
                  <Paperclip className="text-primary size-5" />
                </label>
              </PromptInputAction>

              <Select defaultValue="1">
                <SelectTrigger className="rounded-full focus:ring-0!" size="sm">
                  <GlobeIcon />
                  <div className="hidden lg:flex">
                    <SelectValue placeholder="Select model" />
                  </div>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">Claude 3.5 sonnet</SelectItem>
                  <SelectItem value="2">GPT-4o</SelectItem>
                  <SelectItem value="3">o1</SelectItem>
                  <SelectItem value="4">o3</SelectItem>
                  <SelectItem value="5">Gemini 2.5 Pro</SelectItem>
                  <SelectItem value="6">Gemini 2.5 Flash</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex gap-2">
              <PromptInputAction tooltip="Voice input">
                <Button variant="outline" size="icon" className="size-9 rounded-full">
                  <MicIcon size={18} />
                </Button>
              </PromptInputAction>
              <PromptInputAction tooltip={isStreaming ? "Stop generation" : "Send message"}>
                <Button
                  variant="default"
                  size="icon"
                  className="size-8 rounded-full"
                  onClick={streamResponse}
                  disabled={!prompt.trim()}>
                  {isStreaming ? <SquareIcon /> : <ArrowUpIcon />}
                </Button>
              </PromptInputAction>
            </div>
          </PromptInputActions>
        </Input>
      </div>

      {!isFirstResponse && (
        <div className="relative flex w-full flex-col items-center justify-center space-y-2">
          <div className="absolute top-0 left-0 h-[70px] w-full">
            {showCategorySuggestions ? (
              <div className="flex w-full flex-col space-y-1">
                {activeCategoryData?.items.map((suggestion) => (
                  <Suggestion
                    key={suggestion}
                    highlight={activeCategoryData.highlight}
                    onClick={() => {
                      setPrompt(suggestion);
                      setActiveCategory("");
                      // Optional: auto-send
                      // handleSend()
                    }}>
                    {suggestion}
                  </Suggestion>
                ))}
              </div>
            ) : (
              <div className="relative flex w-full flex-wrap items-stretch justify-start gap-2">
                {suggestionGroups.map((suggestion) => (
                  <Suggestion
                    key={suggestion.label}
                    size="sm"
                    onClick={() => {
                      setActiveCategory(suggestion.label);
                      setPrompt(""); // Clear input when selecting a category
                    }}
                    className="capitalize">
                    {suggestion.icon && <suggestion.icon />}
                    {suggestion.label}
                  </Suggestion>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

const suggestionGroups = [
  {
    icon: BrainIcon,
    label: "Summary",
    highlight: "Summarize",
    items: ["Summarize a document", "Summarize a video", "Summarize a podcast", "Summarize a book"]
  },
  {
    icon: CodeIcon,
    label: "Code",
    highlight: "Help me",
    items: [
      "Help me write React components",
      "Help me debug code",
      "Help me learn Python",
      "Help me learn SQL"
    ]
  },
  {
    icon: DribbbleIcon,
    label: "Design",
    highlight: "Design",
    items: [
      "Design a small logo",
      "Design a hero section",
      "Design a landing page",
      "Design a social media post"
    ]
  },
  {
    icon: GlobeIcon,
    label: "Research",
    highlight: "Research",
    items: [
      "Research the best practices for SEO",
      "Research the best running shoes",
      "Research the best restaurants in Paris",
      "Research the best AI tools"
    ]
  }
];
