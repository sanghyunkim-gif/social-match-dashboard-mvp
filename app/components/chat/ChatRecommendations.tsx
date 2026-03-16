"use client";

type Props = {
  items: string[];
  onSelect: (question: string) => void;
};

export default function ChatRecommendations({ items, onSelect }: Props) {
  if (!items.length) return null;

  return (
    <div className="agent-reco-wrap">
      <div className="agent-reco-label">추천 질문</div>
      <div className="agent-reco-chips">
        {items.map((item) => (
          <button
            key={item}
            type="button"
            className="agent-reco-chip"
            onClick={() => onSelect(item)}
          >
            {item}
          </button>
        ))}
      </div>
    </div>
  );
}
