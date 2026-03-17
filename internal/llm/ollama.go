package llm

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"

	"github.com/RandomCodeSpace/docsgraphcontext/internal/config"
)

type ollamaProvider struct {
	baseURL    string
	chatModel  string
	embedModel string
	client     *http.Client
}

func newOllamaProvider(cfg *config.LLMConfig) (Provider, error) {
	return &ollamaProvider{
		baseURL:    cfg.Ollama.BaseURL,
		chatModel:  cfg.Ollama.ChatModel,
		embedModel: cfg.Ollama.EmbedModel,
		client:     &http.Client{},
	}, nil
}

func (p *ollamaProvider) Name() string    { return "ollama" }
func (p *ollamaProvider) ModelID() string { return p.chatModel }

func (p *ollamaProvider) Complete(ctx context.Context, prompt string, opts ...Option) (string, error) {
	o := applyOptions(opts)

	reqBody := map[string]any{
		"model":  p.chatModel,
		"prompt": prompt,
		"stream": false,
		"options": map[string]any{
			"num_predict": o.maxTokens,
			"temperature": o.temperature,
		},
	}
	if o.jsonMode {
		reqBody["format"] = "json"
	}

	body, err := json.Marshal(reqBody)
	if err != nil {
		return "", fmt.Errorf("ollama complete marshal: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, p.baseURL+"/api/generate", bytes.NewReader(body))
	if err != nil {
		return "", fmt.Errorf("ollama complete request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := p.client.Do(req)
	if err != nil {
		return "", fmt.Errorf("ollama complete: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		b, _ := io.ReadAll(resp.Body)
		return "", fmt.Errorf("ollama complete HTTP %d: %s", resp.StatusCode, b)
	}

	var result struct {
		Response string `json:"response"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return "", fmt.Errorf("ollama complete decode: %w", err)
	}
	return result.Response, nil
}

func (p *ollamaProvider) Embed(ctx context.Context, text string) ([]float32, error) {
	vecs, err := p.EmbedBatch(ctx, []string{text})
	if err != nil {
		return nil, err
	}
	if len(vecs) == 0 {
		return nil, fmt.Errorf("ollama embed: empty response")
	}
	return vecs[0], nil
}

func (p *ollamaProvider) EmbedBatch(ctx context.Context, texts []string) ([][]float32, error) {
	reqBody := map[string]any{
		"model": p.embedModel,
		"input": texts,
	}
	body, err := json.Marshal(reqBody)
	if err != nil {
		return nil, fmt.Errorf("ollama embed marshal: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, p.baseURL+"/api/embed", bytes.NewReader(body))
	if err != nil {
		return nil, fmt.Errorf("ollama embed request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := p.client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("ollama embed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		b, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("ollama embed HTTP %d: %s", resp.StatusCode, b)
	}

	var result struct {
		Embeddings [][]float32 `json:"embeddings"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, fmt.Errorf("ollama embed decode: %w", err)
	}
	return result.Embeddings, nil
}
