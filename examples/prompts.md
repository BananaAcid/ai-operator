
## Some commands for testing:
```bash
# create an agent
baio --reset-prompts --no-ask "create an @agent"

# test a specific agent
baio --reset-prompts --no-ask --agent ChickenTalk "list all files in directory"

# only test agents with selection
baio --reset-prompts --no-ask --agent * "list all files in directory"
```

## Some prompts:

```
how do i install nuxt using npm? read the nuxt website to find out
```
- involes links2
- sometimes searches duckduckgo first for the url
- reads the nuxt installation page and gets the correct result (GEMINI only knows an outdated command)