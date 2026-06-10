return {
  {
    "folke/tokyonight.nvim",
    opts = {
      transparent = true,
    },
  },
  {
    "LazyVim/LazyVim",
    opts = {
      -- I am not sure why but tokyonight seems to work properly properly only
      -- after explicit setting it as the colorscheme (it should be the default
      -- colorscheme). I have started noticing this and other issues after
      -- upgrading to Tahoe 26.4 but I am not sure it is related. We can remove
      -- this and fall back to the default value if this gets fixed.
      colorscheme = "tokyonight",
    },
  },
}
