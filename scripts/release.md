## Equivalente a fazer no terminal:
# bump (ex.: 0.1.15)
sed -i 's/"version": "0\.1\.[0-9]\+"/"version": "0.1.15"/' packages/precise-money/package.json

git add packages/precise-money/package.json
git commit -m "docs: include extra .md files (v0.1.15)"
git push origin main

# tag que dispara o workflow
git tag -a v0.1.15 -m "release: v0.1.15"
git push origin v0.1.15
