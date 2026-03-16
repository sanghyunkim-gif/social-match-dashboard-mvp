"use client";

import type { ReactNode } from "react";
import ChatRecommendations from "./ChatRecommendations";

type TextBlock = { type: "text"; content: string };
type RecoBlock = { type: "recommendations"; items: string[] };
type ChatContentBlock = TextBlock | RecoBlock;

type Props = {
  blocks: ChatContentBlock[];
  onRecommendationSelect: (question: string) => void;
};

/** Simple inline markdown: **bold**, *italic*, `code` */
function parseInline(text: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  const regex = /\*\*(.+?)\*\*|\*(.+?)\*|`(.+?)`/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(text.slice(lastIndex, match.index));
    }
    if (match[1]) {
      nodes.push(<strong key={match.index}>{match[1]}</strong>);
    } else if (match[2]) {
      nodes.push(<em key={match.index}>{match[2]}</em>);
    } else if (match[3]) {
      nodes.push(<code key={match.index} className="agent-inline-code">{match[3]}</code>);
    }
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex));
  }

  return nodes;
}

function renderTextBlock(content: string) {
  return content.split("\n").map((line, j, arr) => (
    <span key={j}>
      {parseInline(line)}
      {j < arr.length - 1 && <br />}
    </span>
  ));
}

export default function ChatMessageRenderer({ blocks, onRecommendationSelect }: Props) {
  return (
    <>
      {blocks.map((block, i) => {
        switch (block.type) {
          case "text":
            return (
              <div key={i} className="agent-text-block">
                {renderTextBlock(block.content)}
              </div>
            );
          case "recommendations":
            return (
              <ChatRecommendations
                key={i}
                items={block.items}
                onSelect={onRecommendationSelect}
              />
            );
          default:
            return null;
        }
      })}
    </>
  );
}
