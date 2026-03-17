package loader

import (
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"

	"golang.org/x/net/html"
)

// WebLoader fetches a single URL and extracts its text content.
type WebLoader struct {
	client *http.Client
}

func NewWebLoader() *WebLoader {
	return &WebLoader{
		client: &http.Client{Timeout: 30 * time.Second},
	}
}

func (l *WebLoader) Supports(ext string) bool { return false } // not file-based

// LoadURL fetches a URL and returns a RawDocument.
func (l *WebLoader) LoadURL(rawURL string) (*RawDocument, error) {
	resp, err := l.client.Get(rawURL)
	if err != nil {
		return nil, fmt.Errorf("fetch %s: %w", rawURL, err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("fetch %s: HTTP %d", rawURL, resp.StatusCode)
	}

	ct := resp.Header.Get("Content-Type")
	if !strings.Contains(ct, "text/html") && !strings.Contains(ct, "text/plain") {
		return nil, fmt.Errorf("%w: %s (content-type: %s)", ErrBinaryFile, rawURL, ct)
	}

	body, err := io.ReadAll(io.LimitReader(resp.Body, 10<<20)) // 10 MB cap
	if err != nil {
		return nil, err
	}

	title, content := extractHTML(body)
	if title == "" {
		// Fall back to URL path as title
		if u, err := url.Parse(rawURL); err == nil {
			title = strings.Trim(u.Path, "/")
			if title == "" {
				title = u.Host
			}
		}
	}

	return &RawDocument{
		Path:    rawURL,
		Title:   title,
		DocType: "web",
		Content: content,
	}, nil
}

// extractHTML parses an HTML document and returns (title, plaintext).
// It prioritises main content areas used by MkDocs, Docusaurus, and Sphinx.
func extractHTML(body []byte) (title, content string) {
	doc, err := html.Parse(strings.NewReader(string(body)))
	if err != nil {
		return "", string(body)
	}

	var sb strings.Builder
	var walk func(*html.Node, bool)

	// Tags whose subtrees we skip entirely
	skipTags := map[string]bool{
		"script": true, "style": true, "noscript": true,
		"nav": true, "footer": true, "header": true,
		"aside": true, "button": true, "form": true,
		"svg": true, "img": true, "figure": true,
	}

	// Content-container IDs/classes used by popular doc sites
	contentAttrs := []string{
		// MkDocs Material
		"md-content", "md-main__inner",
		// Docusaurus
		"docMainContainer", "docItemContainer", "theme-doc-markdown",
		// Sphinx
		"bodywrapper", "body",
		// Generic
		"content", "main-content", "page-content", "article-body",
	}

	isContentNode := func(n *html.Node) bool {
		if n.Type != html.ElementNode {
			return false
		}
		for _, a := range n.Attr {
			if a.Key == "id" || a.Key == "class" {
				for _, want := range contentAttrs {
					if strings.Contains(strings.ToLower(a.Val), want) {
						return true
					}
				}
			}
		}
		return false
	}

	// Try to find a content container first
	var contentNode *html.Node
	var findContent func(*html.Node)
	findContent = func(n *html.Node) {
		if contentNode != nil {
			return
		}
		if n.Type == html.ElementNode {
			switch n.Data {
			case "article", "main":
				contentNode = n
				return
			}
			if isContentNode(n) {
				contentNode = n
				return
			}
		}
		for c := n.FirstChild; c != nil; c = c.NextSibling {
			findContent(c)
		}
	}
	findContent(doc)

	root := doc
	if contentNode != nil {
		root = contentNode
	}

	// Extract title from <title> or first <h1>
	var findTitle func(*html.Node)
	findTitle = func(n *html.Node) {
		if title != "" {
			return
		}
		if n.Type == html.ElementNode && n.Data == "title" {
			if n.FirstChild != nil {
				title = strings.TrimSpace(n.FirstChild.Data)
			}
		}
		for c := n.FirstChild; c != nil; c = c.NextSibling {
			findTitle(c)
		}
	}
	findTitle(doc)

	prevWasBlock := false
	walk = func(n *html.Node, inPre bool) {
		if n.Type == html.ElementNode && skipTags[n.Data] {
			return
		}
		if n.Type == html.TextNode {
			text := n.Data
			if !inPre {
				text = strings.Join(strings.Fields(text), " ")
			}
			if text != "" {
				if prevWasBlock {
					sb.WriteString("\n")
					prevWasBlock = false
				}
				sb.WriteString(text)
				sb.WriteString(" ")
			}
			return
		}
		if n.Type == html.ElementNode {
			blockTags := map[string]bool{
				"p": true, "br": true, "li": true,
				"h1": true, "h2": true, "h3": true, "h4": true, "h5": true, "h6": true,
				"div": true, "section": true, "blockquote": true,
				"tr": true, "td": true, "th": true,
				"pre": true, "code": true,
			}
			if blockTags[n.Data] {
				if sb.Len() > 0 {
					sb.WriteString("\n")
				}
				prevWasBlock = true
			}
			if n.Data == "h1" && title == "" {
				// capture first h1 as title
				var h1 strings.Builder
				for c := n.FirstChild; c != nil; c = c.NextSibling {
					if c.Type == html.TextNode {
						h1.WriteString(c.Data)
					}
				}
				title = strings.TrimSpace(h1.String())
			}
		}
		for c := n.FirstChild; c != nil; c = c.NextSibling {
			walk(c, inPre || (n.Type == html.ElementNode && n.Data == "pre"))
		}
	}
	walk(root, false)

	return strings.TrimSpace(title), strings.TrimSpace(sb.String())
}
