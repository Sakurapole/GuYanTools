---
trigger: model_decision
description: 当你需要修改应用端调用rust层相关的内容时，参照下面的内容
---

1. 将修改和rust层对齐，保证不只是前端的修改，调用rust层的功能也要对齐
2. 优先执行rust层的修改，再执行前端相关的修改