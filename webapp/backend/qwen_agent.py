#!/usr/bin/env python3
"""
Qwen 2.5 MCP Agent - Local AI agent with autonomous tool usage
"""

import json
import os
import logging
from typing import List, Dict, Any, Optional
from pathlib import Path

import ollama
import arxiv
import feedparser
import PyPDF2
import yt_dlp
from duckduckgo_search import DDGS


# Setup logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


class MCPTools:
    """Registry and executor for all MCP tools"""
    
    DOWNLOADS_DIR = Path(__file__).parent.parent.parent / "downloads"
    DOWNLOADS_DIR.mkdir(exist_ok=True)
    
    # Also save to server/data/pdfs for integration with the main app
    DATA_PDFS_DIR = Path(__file__).parent.parent.parent / "server" / "data" / "pdfs"
    DATA_PDFS_DIR.mkdir(parents=True, exist_ok=True)
    
    # Cache tool definitions to avoid recreating on every call
    _tool_definitions_cache: Optional[List[Dict]] = None
    
    @staticmethod
    def get_tool_definitions() -> List[Dict]:
        """Return all tool definitions in Ollama function calling format (cached)"""
        if MCPTools._tool_definitions_cache is None:
            MCPTools._tool_definitions_cache = [
            {
                "type": "function",
                "function": {
                    "name": "web_search",
                    "description": "Search the web for information using DuckDuckGo",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "query": {
                                "type": "string",
                                "description": "Search query string"
                            },
                            "max_results": {
                                "type": "integer",
                                "description": "Maximum number of results to return (default: 5)",
                                "default": 5
                            }
                        },
                        "required": ["query"]
                    }
                }
            },
            {
                "type": "function",
                "function": {
                    "name": "get_news",
                    "description": "Get latest news articles from Google News RSS feed",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "topic": {
                                "type": "string",
                                "description": "News topic or keyword to search for"
                            },
                            "limit": {
                                "type": "integer",
                                "description": "Maximum number of news articles to return (default: 10)",
                                "default": 10
                            }
                        },
                        "required": ["topic"]
                    }
                }
            },
            {
                "type": "function",
                "function": {
                    "name": "arxiv_search",
                    "description": "Search for research papers on arXiv",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "query": {
                                "type": "string",
                                "description": "Search query for arXiv papers"
                            },
                            "max_results": {
                                "type": "integer",
                                "description": "Maximum number of papers to return (default: 5)",
                                "default": 5
                            }
                        },
                        "required": ["query"]
                    }
                }
            },
            {
                "type": "function",
                "function": {
                    "name": "arxiv_download",
                    "description": "Download a PDF paper from arXiv by its ID",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "arxiv_id": {
                                "type": "string",
                                "description": "arXiv paper ID (e.g., '2301.12345' or '2301.12345v1')"
                            },
                            "output_path": {
                                "type": "string",
                                "description": "Optional output path for the PDF. If not provided, saves to downloads/ directory"
                            }
                        },
                        "required": ["arxiv_id"]
                    }
                }
            },
            {
                "type": "function",
                "function": {
                    "name": "pdf_summary",
                    "description": "Extract text from a PDF file and provide a summary",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "pdf_path": {
                                "type": "string",
                                "description": "Path to the PDF file to summarize"
                            }
                        },
                        "required": ["pdf_path"]
                    }
                }
            },
            {
                "type": "function",
                "function": {
                    "name": "youtube_search",
                    "description": "Search for videos on YouTube",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "query": {
                                "type": "string",
                                "description": "Search query for YouTube videos"
                            },
                            "max_results": {
                                "type": "integer",
                                "description": "Maximum number of videos to return (default: 5)",
                                "default": 5
                            }
                        },
                        "required": ["query"]
                    }
                }
            },
            {
                "type": "function",
                "function": {
                    "name": "youtube_download",
                    "description": "Download a video from YouTube by its URL",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "video_url": {
                                "type": "string",
                                "description": "YouTube video URL"
                            },
                            "output_path": {
                                "type": "string",
                                "description": "Optional output path for the video. If not provided, saves to downloads/ directory"
                            }
                        },
                        "required": ["video_url"]
                    }
                }
            }
        ]
        return MCPTools._tool_definitions_cache
    
    @staticmethod
    def execute_tool(tool_name: str, arguments: Dict) -> Dict:
        """Execute a tool by name with given arguments"""
        try:
            if tool_name == "web_search":
                return MCPTools._web_search(**arguments)
            elif tool_name == "get_news":
                return MCPTools._get_news(**arguments)
            elif tool_name == "arxiv_search":
                return MCPTools._arxiv_search(**arguments)
            elif tool_name == "arxiv_download":
                return MCPTools._arxiv_download(**arguments)
            elif tool_name == "pdf_summary":
                return MCPTools._pdf_summary(**arguments)
            elif tool_name == "youtube_search":
                return MCPTools._youtube_search(**arguments)
            elif tool_name == "youtube_download":
                return MCPTools._youtube_download(**arguments)
            else:
                return {
                    "success": False,
                    "error": f"Unknown tool: {tool_name}"
                }
        except Exception as e:
            logger.error(f"Error executing tool {tool_name}: {str(e)}")
            return {
                "success": False,
                "error": str(e)
            }
    
    @staticmethod
    def _web_search(query: str, max_results: int = 5) -> Dict:
        """Search the web using DuckDuckGo"""
        try:
            with DDGS() as ddgs:
                results = list(ddgs.text(query, max_results=max_results))
                return {
                    "success": True,
                    "data": {
                        "query": query,
                        "results": [
                            {
                                "title": r.get("title", ""),
                                "url": r.get("href", ""),
                                "snippet": r.get("body", "")
                            }
                            for r in results
                        ]
                    }
                }
        except Exception as e:
            return {"success": False, "error": str(e)}
    
    @staticmethod
    def _get_news(topic: str, limit: int = 10) -> Dict:
        """Get news from Google News RSS"""
        try:
            # Google News RSS URL
            url = f"https://news.google.com/rss/search?q={topic}&hl=en-US&gl=US&ceid=US:en"
            feed = feedparser.parse(url)
            
            articles = []
            for entry in feed.entries[:limit]:
                articles.append({
                    "title": entry.get("title", ""),
                    "link": entry.get("link", ""),
                    "published": entry.get("published", ""),
                    "summary": entry.get("summary", "")[:500]  # Limit summary length
                })
            
            return {
                "success": True,
                "data": {
                    "topic": topic,
                    "articles": articles
                }
            }
        except Exception as e:
            return {"success": False, "error": str(e)}
    
    @staticmethod
    def _arxiv_search(query: str, max_results: int = 5) -> Dict:
        """Search arXiv for papers"""
        try:
            search = arxiv.Search(
                query=query,
                max_results=max_results,
                sort_by=arxiv.SortCriterion.Relevance
            )
            
            papers = []
            for result in search.results():
                papers.append({
                    "title": result.title,
                    "authors": [author.name for author in result.authors],
                    "arxiv_id": result.entry_id.split('/')[-1],
                    "published": str(result.published),
                    "summary": result.summary[:500],  # Limit summary length
                    "pdf_url": result.pdf_url
                })
            
            return {
                "success": True,
                "data": {
                    "query": query,
                    "papers": papers
                }
            }
        except Exception as e:
            return {"success": False, "error": str(e)}
    
    @staticmethod
    def _arxiv_download(arxiv_id: str, output_path: Optional[str] = None) -> Dict:
        """Download a paper from arXiv and save to both downloads/ and server/data/pdfs/"""
        try:
            import shutil
            
            # Clean arxiv_id (remove 'arxiv:' prefix if present)
            clean_id = arxiv_id.replace("arxiv:", "").replace("arXiv:", "")
            
            # Create search for this specific paper
            search = arxiv.Search(id_list=[clean_id])
            paper = next(search.results(), None)
            
            if not paper:
                return {"success": False, "error": f"Paper {arxiv_id} not found"}
            
            # Determine primary output path (downloads/)
            if output_path is None:
                primary_path = MCPTools.DOWNLOADS_DIR / f"{clean_id}.pdf"
            else:
                primary_path = Path(output_path)
            
            # Download the PDF to primary location
            paper.download_pdf(dirpath=str(primary_path.parent), filename=primary_path.name)
            
            # Also save to server/data/pdfs/ for integration with main app
            data_pdf_path = MCPTools.DATA_PDFS_DIR / f"{clean_id}.pdf"
            shutil.copy2(primary_path, data_pdf_path)
            
            return {
                "success": True,
                "data": {
                    "arxiv_id": clean_id,
                    "title": paper.title,
                    "file_path": str(primary_path),
                    "data_pdf_path": str(data_pdf_path),
                    "pdf_url": paper.pdf_url
                }
            }
        except Exception as e:
            return {"success": False, "error": str(e)}
    
    @staticmethod
    def _pdf_summary(pdf_path: str) -> Dict:
        """Extract text from PDF and provide summary"""
        try:
            pdf_path = Path(pdf_path)
            if not pdf_path.exists():
                return {"success": False, "error": f"PDF file not found: {pdf_path}"}
            
            # Extract text from PDF
            text = ""
            with open(pdf_path, 'rb') as file:
                pdf_reader = PyPDF2.PdfReader(file)
                for page in pdf_reader.pages:
                    text += page.extract_text() + "\n"
            
            # Limit text length to avoid context issues
            text = text[:5000] if len(text) > 5000 else text
            
            return {
                "success": True,
                "data": {
                    "pdf_path": str(pdf_path),
                    "extracted_text": text,
                    "text_length": len(text),
                    "note": "This is the extracted text. The agent will provide a summary based on this."
                }
            }
        except Exception as e:
            return {"success": False, "error": str(e)}
    
    @staticmethod
    def _youtube_search(query: str, max_results: int = 5) -> Dict:
        """Search YouTube for videos"""
        try:
            ydl_opts = {
                'quiet': True,
                'no_warnings': True,
                'extract_flat': True,
            }
            
            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                search_url = f"ytsearch{max_results}:{query}"
                info = ydl.extract_info(search_url, download=False)
                
                videos = []
                if 'entries' in info:
                    for entry in info['entries']:
                        if entry:
                            videos.append({
                                "title": entry.get('title', ''),
                                "url": f"https://www.youtube.com/watch?v={entry.get('id', '')}",
                                "duration": entry.get('duration', 0),
                                "channel": entry.get('channel', ''),
                                "view_count": entry.get('view_count', 0)
                            })
                
                return {
                    "success": True,
                    "data": {
                        "query": query,
                        "videos": videos
                    }
                }
        except Exception as e:
            return {"success": False, "error": str(e)}
    
    @staticmethod
    def _youtube_download(video_url: str, output_path: Optional[str] = None) -> Dict:
        """Download a YouTube video"""
        try:
            # Determine output path
            if output_path is None:
                output_path = MCPTools.DOWNLOADS_DIR / "%(title)s.%(ext)s"
            else:
                output_path = Path(output_path)
                if not output_path.suffix:
                    output_path = output_path.parent / f"{output_path.name}.%(ext)s"
            
            ydl_opts = {
                'outtmpl': str(output_path),
                'format': 'best[ext=mp4]/best',
                'quiet': False,
            }
            
            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                info = ydl.extract_info(video_url, download=True)
                filename = ydl.prepare_filename(info)
                
                return {
                    "success": True,
                    "data": {
                        "video_url": video_url,
                        "title": info.get('title', ''),
                        "file_path": filename,
                        "duration": info.get('duration', 0)
                    }
                }
        except Exception as e:
            return {"success": False, "error": str(e)}


class QwenOllamaAgent:
    """Agent that uses Qwen 2.5 via Ollama with autonomous tool usage"""
    
    def __init__(self, model: str = "qwen2.5:7b", verbose: bool = True):
        self.model = model
        self.verbose = verbose
        self.tools = MCPTools()
        
        # System prompt to guide tool usage
        self.system_prompt = """You are a helpful AI assistant with access to various tools.

IMPORTANT TOOL USAGE RULES:

1. When user asks to "download" or "get" papers/videos, you MUST use the download tools (arxiv_download, youtube_download)

2. When user asks to "find" or "search", use search tools first (arxiv_search, youtube_search)

3. If user says "download and summarize", use download tool THEN pdf_summary tool

4. ALWAYS actually execute download tools - don't just provide links

5. After downloading, confirm the file location

Available actions:

- arxiv_search: Find papers (returns metadata)

- arxiv_download: Actually download PDF files locally

- youtube_search: Find videos (returns metadata)  

- youtube_download: Actually download video files locally

- web_search: Search the web

- get_news: Get latest news

- pdf_summary: Summarize downloaded PDFs"""
        
        # Initialize conversation history with system prompt
        self.conversation_history = [
            {
                "role": "system",
                "content": self.system_prompt
            }
        ]
        
        # Check Ollama connection
        self._check_ollama()
        
        # Verify model availability
        self._check_model()
    
    def _check_ollama(self):
        """Check if Ollama is running"""
        try:
            ollama.list()
            if self.verbose:
                logger.info("✓ Ollama connection successful")
        except Exception as e:
            raise ConnectionError(
                f"Ollama is not running. Please start it with 'ollama serve'"
            ) from e
    
    def _check_model(self):
        """Check if model is available, pull if needed"""
        try:
            response = ollama.list()
            models = [m.model for m in response.models]
            if self.model not in models:
                if self.verbose:
                    logger.info(f"Model {self.model} not found. Pulling...")
                ollama.pull(self.model)
                if self.verbose:
                    logger.info(f"✓ Model {self.model} ready")
            else:
                if self.verbose:
                    logger.info(f"✓ Model {self.model} available")
        except Exception as e:
            raise RuntimeError(f"Failed to check/pull model: {str(e)}") from e
    
    def chat(self, user_message: str) -> str:
        """Main chat method with automatic tool calling"""
        if self.verbose:
            logger.info(f"User: {user_message}")
        
        # Limit conversation history to last 15 messages (keeps system prompt + recent context)
        MAX_HISTORY_LENGTH = 15
        if len(self.conversation_history) > MAX_HISTORY_LENGTH:
            # Keep system prompt + recent messages
            self.conversation_history = (
                [self.conversation_history[0]] +  # System prompt (first message)
                self.conversation_history[-(MAX_HISTORY_LENGTH-1):]  # Recent messages
            )
        
        # Add user message to history
        self.conversation_history.append({
            "role": "user",
            "content": user_message
        })
        
        # Get tool definitions (now cached for performance)
        tool_definitions = self.tools.get_tool_definitions()
        
        # Maximum tool call iterations to prevent infinite loops
        max_iterations = 5
        iteration = 0
        
        while iteration < max_iterations:
            iteration += 1
            
            if self.verbose:
                logger.info(f"Iteration {iteration}: Calling model...")
            
            # Call Ollama with tools
            try:
                response = ollama.chat(
                    model=self.model,
                    messages=self.conversation_history,
                    tools=tool_definitions
                )
            except Exception as e:
                error_msg = f"Error calling Ollama: {str(e)}"
                logger.error(error_msg)
                return error_msg
            
            message = response['message']
            
            # Add assistant's response to history
            self.conversation_history.append({
                "role": "assistant",
                "content": message.get('content', ''),
                "tool_calls": message.get('tool_calls', [])
            })
            
            # Check if model wants to use tools
            tool_calls = message.get('tool_calls', [])
            
            if not tool_calls:
                # No more tool calls, return final answer
                final_answer = message.get('content', '')
                if self.verbose:
                    logger.info("✓ Final answer ready")
                return final_answer
            
            # Execute tool calls
            if self.verbose:
                logger.info(f"Executing {len(tool_calls)} tool call(s)...")
            
            for tool_call in tool_calls:
                tool_name = tool_call['function']['name']
                try:
                    # Parse arguments (handle both string and dict)
                    arguments = tool_call['function'].get('arguments', {})
                    if isinstance(arguments, str):
                        arguments = json.loads(arguments)
                except json.JSONDecodeError:
                    arguments = {}
                
                if self.verbose:
                    logger.info(f"  → {tool_name}({arguments})")
                
                # Execute tool
                result = self.tools.execute_tool(tool_name, arguments)
                
                # Add tool result to conversation
                self.conversation_history.append({
                    "role": "tool",
                    "content": json.dumps(result, indent=2),
                    "name": tool_name
                })
                
                if self.verbose:
                    status = "✓" if result.get("success") else "✗"
                    logger.info(f"  {status} {tool_name} completed")
        
        # If we've reached max iterations, return the last response
        if self.verbose:
            logger.warning(f"Reached max iterations ({max_iterations})")
        
        return message.get('content', 'No response generated')
    
    def reset(self):
        """Reset conversation history (preserves system prompt)"""
        self.conversation_history = [
            {
                "role": "system",
                "content": self.system_prompt
            }
        ]
        if self.verbose:
            logger.info("Conversation history reset")


def main():
    """CLI interface"""
    import argparse
    
    parser = argparse.ArgumentParser(description="Qwen 2.5 MCP Agent")
    parser.add_argument(
        "--model",
        default="qwen2.5:7b",
        help="Ollama model to use (default: qwen2.5:7b)"
    )
    parser.add_argument(
        "--quiet",
        action="store_true",
        help="Disable verbose logging"
    )
    args = parser.parse_args()
    
    # Create agent
    agent = QwenOllamaAgent(model=args.model, verbose=not args.quiet)
    
    print("\n" + "="*60)
    print("Qwen 2.5 MCP Agent - Ready!")
    print("="*60)
    print("Type your questions. The agent will automatically use tools.")
    print("Type 'quit' or 'exit' to end.\n")
    
    # Interactive loop
    while True:
        try:
            user_input = input("You: ").strip()
            
            if not user_input:
                continue
            
            if user_input.lower() in ['quit', 'exit', 'q']:
                print("Goodbye!")
                break
            
            if user_input.lower() == 'reset':
                agent.reset()
                print("Conversation reset.\n")
                continue
            
            # Get response
            response = agent.chat(user_input)
            print(f"\nAgent: {response}\n")
            
        except KeyboardInterrupt:
            print("\n\nGoodbye!")
            break
        except Exception as e:
            print(f"\nError: {str(e)}\n")


if __name__ == "__main__":
    main()

