package cmd

import (
	"fmt"

	"github.com/spf13/cobra"
)

// Set via -ldflags at build time.
var (
	Version = "dev"
	Commit  = "unknown"
	Date    = "unknown"
)

var versionCmd = &cobra.Command{
	Use:   "version",
	Short: "Print the version of DocsContext",
	Run: func(cmd *cobra.Command, args []string) {
		fmt.Printf("DocsContext %s (commit: %s, built: %s)\n", Version, Commit, Date)
	},
}

func init() {
	rootCmd.AddCommand(versionCmd)
}
