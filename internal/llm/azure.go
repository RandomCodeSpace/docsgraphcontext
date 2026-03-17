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

type azureProvider struct {
	endpoint   string
	apiKey     string
	apiVersion string
	chatModel  string
	embedModel string
	client     *http.Client
}

func newAzureProvider(cfg *config.LLMConfig) (Provider, error) {
	return &azureProvider{
		endpoint:   cfg.Azure.Endpoint,
		apiKey:     cfg.Azure.APIKey,
		apiVersion: cfg.Azure.APIVersion,
		chatModel:  cfg.Azure.ChatModel,
		embedModel: cfg.Azure.EmbedModel,
		client:     &http.Client{},
	}, nil
}

func (p *azureProvider) Name() string    { return "azure" }
func (p *azureProvider) ModelID() string { return p.chatModel }

func (p *azureProvider) Complete(ctx context.Context, prompt string, opts ...Option) (string, error) {
	o := applyOptions(opts)

	type message struct {
		Role    string `json:"role"`
		Content string `json:"content"`
	}
	reqBody := map[string]any{
		"messages":    []message{{Role: "user", Content: prompt}},
		"max_tokens":  o.maxTokens,
		"temperature": o.temperature,
	}
	if o.jsonMode {
		reqBody["response_format"] = map[string]string{"type": "json_object"}
	}

	body, err := json.Marshal(reqBody)
	if err != nil {
		return "", fmt.Errorf("azure complete marshal: %w", err)
	}

	url := fmt.Sprintf("%s/openai/deployments/%s/chat/completions?api-version=%s",
		p.endpoint, p.chatModel, p.apiVersion)
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(body))
	if err != nil {
		return "", fmt.Errorf("azure complete request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("api-key", p.apiKey)

	resp, err := p.client.Do(req)
	if err != nil {
		return "", fmt.Errorf("azure complete: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		b, _ := io.ReadAll(resp.Body)
		return "", fmt.Errorf("azure complete HTTP %d: %s", resp.StatusCode, b)
	}

	var result struct {
		Choices []struct {
			Message struct {
				Content string `json:"content"`
			} `json:"message"`
		} `json:"choices"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return "", fmt.Errorf("azure complete decode: %w", err)
	}
	if len(result.Choices) == 0 {
		return "", fmt.Errorf("azure complete: empty response")
	}
	return result.Choices[0].Message.Content, nil
}

func (p *azureProvider) Embed(ctx context.Context, text string) ([]float32, error) {
	vecs, err := p.EmbedBatch(ctx, []string{text})
	if err != nil {
		return nil, err
	}
	if len(vecs) == 0 {
		return nil, fmt.Errorf("azure embed: empty response")
	}
	return vecs[0], nil
}

func (p *azureProvider) EmbedBatch(ctx context.Context, texts []string) ([][]float32, error) {
	reqBody := map[string]any{"input": texts}
	body, err := json.Marshal(reqBody)
	if err != nil {
		return nil, fmt.Errorf("azure embed marshal: %w", err)
	}

	url := fmt.Sprintf("%s/openai/deployments/%s/embeddings?api-version=%s",
		p.endpoint, p.embedModel, p.apiVersion)
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(body))
	if err != nil {
		return nil, fmt.Errorf("azure embed request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("api-key", p.apiKey)

	resp, err := p.client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("azure embed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		b, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("azure embed HTTP %d: %s", resp.StatusCode, b)
	}

	var result struct {
		Data []struct {
			Embedding []float32 `json:"embedding"`
		} `json:"data"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, fmt.Errorf("azure embed decode: %w", err)
	}

	vecs := make([][]float32, len(result.Data))
	for i, d := range result.Data {
		vecs[i] = d.Embedding
	}
	return vecs, nil
}
