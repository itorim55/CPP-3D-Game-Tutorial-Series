' Arranca o site sem janela (para o Agendador de Tarefas do Windows).
' Assume que este ficheiro está em rust-server-website\deploy\.
Set fso = CreateObject("Scripting.FileSystemObject")
root = fso.GetParentFolderName(fso.GetParentFolderName(WScript.ScriptFullName))
Set shell = CreateObject("WScript.Shell")
shell.CurrentDirectory = root
shell.Run "node server\app.js", 0, False
