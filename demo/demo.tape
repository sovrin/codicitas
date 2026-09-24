# The demo GIF, recorded with VHS (github.com/charmbracelet/vhs):
#
#   npm run record
#
# writes demo/demo.gif and demo/screenshot.png. The journal is filled by seed.ts, Jira and GitHub are
# played by mock.mjs, and codi runs in tmux, whose status bar carries the
# captions: each is set while recording is paused, so only the caption shows.
# In a caption, a # is written ## and #[...] styles what follows, as tmux
# reads it.

Output demo/demo.gif

Require codi
Require tmux

Set Shell "bash"
Set FontFamily "JetBrains Mono"
Set FontSize 18
Set Width 1280
Set Height 800
Set Padding 24
Set WindowBar Colorful
Set Theme "Catppuccin Mocha"
Set TypingSpeed 60ms

Hide
Type "tmux -u -f demo/tmux.conf new -s demo" Enter
Sleep 1.5s
Type "source demo/setup.sh" Enter
Sleep 6s
Ctrl+B
Type@1ms `:set -g @caption "  codicitas  ·  a journal for your working day, in the terminal  "`
Enter
Sleep 150ms
Show
Sleep 1.5s
Type "codi" Sleep 500ms Enter
Sleep 1s

Hide
Ctrl+B
Type@1ms `:set -g @caption "  today, down one line  ·  titles and checks arrive from Jira and GitHub  "`
Enter
Sleep 150ms
Show
Sleep 4.5s

Hide
Ctrl+B
Type@1ms `:set -g @caption "  #[bg=#89b4fa,fg=#1e1e2e,bold] i #[default]  write an entry  ·  /done tags it, and SHOP-311 gets its title from Jira  "`
Enter
Sleep 150ms
Show
Sleep 1.5s
Type "i" Sleep 600ms
Type "/done fixed SHOP-311, retries are safe now" Sleep 900ms Enter
Sleep 3.5s

Hide
Ctrl+B
Type@1ms `:set -g @caption "  #[bg=#89b4fa,fg=#1e1e2e,bold] >fri #[default]  a todo due by Friday  ·  yellow on the day it's due, red once it's overdue  "`
Enter
Sleep 150ms
Show
Sleep 1.5s
Type "i" Sleep 600ms
Type "/todo >fri send @jonas the #payments numbers" Sleep 900ms Enter
Sleep 3.5s

Hide
Ctrl+B
Type@1ms `:set -g @caption "  #[bg=#89b4fa,fg=#1e1e2e,bold] h #[default]  the day before  ·  #[bg=#89b4fa,fg=#1e1e2e,bold] t #[default]  back to today  "`
Enter
Sleep 150ms
Show
Sleep 1.5s
Type "h" Sleep 3.5s
Type "t" Sleep 1.5s

Hide
Ctrl+B
Type@1ms `:set -g @caption "  #[bg=#89b4fa,fg=#1e1e2e,bold] s #[default]  the standup: done, next and blocked, ready to paste  "`
Enter
Sleep 150ms
Show
Sleep 1.5s
Type "s" Sleep 4.5s
Escape Sleep 800ms

Hide
Ctrl+B
Type@1ms `:set -g @caption "  #[bg=#89b4fa,fg=#1e1e2e,bold] o #[default]  every open todo, from any day: what's due first, then the most urgent  "`
Enter
Sleep 150ms
Show
Sleep 1.5s
Type "o" Sleep 4s
Escape Sleep 800ms

Hide
Ctrl+B
Type@1ms `:set -g @caption "  #[bg=#89b4fa,fg=#1e1e2e,bold] / #[default]  search every day as you type  "`
Enter
Sleep 150ms
Show
Sleep 1.5s
Type "/" Sleep 500ms
Type "payments" Sleep 3.5s
Escape Sleep 800ms

Hide
Ctrl+B
Type@1ms `:set -g @caption "  #[bg=#89b4fa,fg=#1e1e2e,bold] r #[default]  refresh  ·  shop##482's checks have passed meanwhile: its underline turns from yellow to green  "`
Enter
Sleep 150ms
Show
Sleep 2s
Type "r" Sleep 4s

Hide
Ctrl+B
Type@1ms `:set -g @caption "  #[bg=#89b4fa,fg=#1e1e2e,bold] , #[default]  settings  ·  #[bg=#89b4fa,fg=#1e1e2e,bold] tab #[default]  modules: Jira and GitHub, each set up on a page of its own  "`
Enter
Sleep 150ms
Show
Sleep 1.5s
Type "," Sleep 1.5s
Tab Sleep 2s
Down Sleep 800ms
Enter Sleep 4s
Escape Sleep 500ms
Escape Sleep 800ms

Hide
Ctrl+B
Type@1ms `:set -g @caption "  codicitas  ·  github.com/sovrin/codicitas  "`
Enter
Sleep 150ms
Show
Sleep 3s

# the README's screenshot: the day as it ends, without a caption. VHS takes
# it from the next frame it records, so this is the last thing it records.
Hide
Ctrl+B
Type@1ms `:set status off`
Enter
Sleep 500ms
Show
Screenshot demo/screenshot.png
Sleep 300ms
