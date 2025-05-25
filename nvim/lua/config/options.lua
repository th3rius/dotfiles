-- Options are automatically loaded before lazy.nvim startup
-- Default options that are always set: https://github.com/LazyVim/LazyVim/blob/main/lua/lazyvim/config/options.lua
-- Add any additional options here

-- Spellcheck languages
vim.opt.spelllang = { "en", "pt_BR" }

-- Disables LazyVim auto format.
vim.g.autoformat = false

-- LSP auto detection can be annoying on messy projects.
vim.g.root_spec = { { ".git", "lua" }, "cwd" }
