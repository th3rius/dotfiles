return {
  {
    "catppuccin",
    optional = true,
    opts = function(_, opts)
      local bufferline = require("catppuccin.groups.integrations.bufferline")
      bufferline.get = bufferline.get or bufferline.get_theme
      opts.background = {
        light = "latte",
        -- dark = "frappe",
      }
    end,
  },
}
