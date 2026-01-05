import { useMemo } from 'react';

interface UnderlineRule {
  patterns: string[];
  type: 'positive' | 'negative' | 'entity' | 'feature';
  className: string;
  caseSensitive?: boolean;
}

const underlineRules: UnderlineRule[] = [
  // Positive emotion words
  {
    patterns: ['amazing', 'excellent', 'highly recommend', 'love', 'perfect', 'great', 'good', 'nice', 'satisfied', 'surprise', 'awesome', 'fantastic', 'wonderful', 'brilliant', 'outstanding', 'superb', 'impressed', 'best', 'worth', 'value'],
    type: 'positive',
    className: 'underline decoration-2 decoration-green-500 dark:decoration-green-400 underline-offset-2'
  },
  // Negative emotion words
  {
    patterns: ['disappointed', 'terrible', 'bad', 'poor', 'worst', 'regret', 'garbage', 'useless', 'waste', 'problem', 'issue', 'broken', 'difficult', 'not recommend', 'return'],
    type: 'negative',
    className: 'underline decoration-2 decoration-red-500 dark:decoration-red-400 underline-offset-2'
  },
  // Brand and product names
  {
    patterns: ['Amazon', 'Alexa', 'Echo', 'Apple', 'Google', 'Samsung', 'Sony', 'Microsoft', 'iPhone', 'iPad', 'MacBook', 'Windows', 'Android'],
    type: 'entity',
    className: 'underline decoration-2 decoration-blue-500 dark:decoration-blue-400 underline-offset-2',
    caseSensitive: true
  },
  // Features and functions
  {
    patterns: ['sound quality', 'volume', 'battery', 'charging', 'connection', 'WiFi', 'Bluetooth', 'setup', 'install', 'compatible', 'performance', 'speed', 'display', 'screen'],
    type: 'feature',
    className: 'underline decoration-2 decoration-amber-500 dark:decoration-amber-400 underline-offset-2'
  }
];

interface UnderlinedTextProps {
  text: string;
  className?: string;
}

export function UnderlinedText({ text, className = '' }: UnderlinedTextProps) {
  const elements = useMemo(() => {
    if (!text) return text;

    const matches: Array<{ start: number; end: number; className: string; text: string }> = [];

    // Find all matches
    underlineRules.forEach(rule => {
      rule.patterns.forEach(pattern => {
        const searchText = rule.caseSensitive ? text : text.toLowerCase();
        const searchPattern = rule.caseSensitive ? pattern : pattern.toLowerCase();
        
        let index = 0;
        while (index < searchText.length) {
          const foundIndex = searchText.indexOf(searchPattern, index);
          if (foundIndex === -1) break;
          
          matches.push({
            start: foundIndex,
            end: foundIndex + pattern.length,
            className: rule.className,
            text: text.slice(foundIndex, foundIndex + pattern.length)
          });
          
          index = foundIndex + 1;
        }
      });
    });

    // If no matches, return original text
    if (matches.length === 0) {
      return text;
    }

    // Sort by position
    matches.sort((a, b) => a.start - b.start);

    // Remove overlapping matches (keep first one)
    const filteredMatches: typeof matches = [];
    matches.forEach(match => {
      const hasOverlap = filteredMatches.some(
        existing => 
          (match.start >= existing.start && match.start < existing.end) ||
          (match.end > existing.start && match.end <= existing.end)
      );
      if (!hasOverlap) {
        filteredMatches.push(match);
      }
    });

    // Build highlighted text
    const result: JSX.Element[] = [];
    let lastIndex = 0;

    filteredMatches.forEach((match, i) => {
      // Add normal text before match
      if (match.start > lastIndex) {
        result.push(
          <span key={`text-${i}`}>{text.slice(lastIndex, match.start)}</span>
        );
      }

      // Add underlined text
      result.push(
        <span
          key={`underline-${i}`}
          className={match.className}
        >
          {match.text}
        </span>
      );

      lastIndex = match.end;
    });

    // Add remaining text
    if (lastIndex < text.length) {
      result.push(
        <span key="text-end">{text.slice(lastIndex)}</span>
      );
    }

    return result;
  }, [text]);

  return <span className={className}>{elements}</span>;
}
