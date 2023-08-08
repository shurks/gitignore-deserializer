# Gitignore deserializer
by [Hurx (Stan Hurks) 📧](mailto://stan@hurx.digital)

Checks a path to see if it is ignored by any .gitignore files in its directory or its parents directories.

Automatically caches each .gitignore file and uses the cache if the file hasn't been modified since.

## Example
```typescript
import path from 'path'
import Deserializer from '@hurx/gitignore-deserializer'

// Check if a path is ignored
if (Deserializer.isIgnored(path.resolve('node_modules'))) {
    // <...>
}
```

## Made with ♥️

[Buying me a coffee ☕](https://www.buymeacoffee.com/hurx) contributes to making easy to use and efficient software tools and products for free!