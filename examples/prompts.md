
## Some commands for testing:
```bash
# create an agent
baio --reset-prompts --no-ask "create an @agent"

# test a specific agent
baio --reset-prompts --no-ask --agent ChickenTalk "list all files in directory"

# only test agents with selection
baio --reset-prompts --no-ask --agent * "list all files in directory"

# test image
baio -f cat.jpg "what is this file about"
```

## Some prompts:

```
read the content of ./readme.md and check with no tools for spelling errors 
```
- directly reads the contents of the file
- generates a command to replace errors (sometimes without extra asking)


```
how do i install nuxt using npm? read the nuxt website to find out
```
- involes links2
- sometimes searches duckduckgo first for the url
- reads the nuxt installation page and gets the correct result (GEMINI only knows an outdated command)

```
go user folder and tell me about the files
``` 
- does a change dir command
- then a list files/folders command

```
go user folder and exlpain files
```
- does a change dir command
- creates a table with the file names and a description