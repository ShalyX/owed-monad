Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
[Windows.Forms.Application]::EnableVisualStyles()
$form = New-Object Windows.Forms.Form
$form.Text = "Owed | Connect Hugging Face"
$form.Width = 470
$form.Height = 222
$form.StartPosition = "CenterScreen"
$form.TopMost = $true
$form.FormBorderStyle = [Windows.Forms.FormBorderStyle]::FixedDialog
$form.MaximizeBox = $false
$form.MinimizeBox = $false
$label = New-Object Windows.Forms.Label
$label.Text = "Paste your Hugging Face token here. It stays on this PC."
$label.SetBounds(22,20,415,33)
$label.Font = New-Object Drawing.Font("Segoe UI",10)
$form.Controls.Add($label)
$input = New-Object Windows.Forms.TextBox
$input.SetBounds(22,65,415,30)
$input.UseSystemPasswordChar = $true
$input.Font = New-Object Drawing.Font("Consolas",11)
$form.Controls.Add($input)
$save = New-Object Windows.Forms.Button
$save.Text = "Save locally"
$save.SetBounds(300,115,135,32)
$form.Controls.Add($save)
$msg = New-Object Windows.Forms.Label
$msg.Text = "Never stored in Git. Never shared in chat."
$msg.SetBounds(22,123,265,35)
$msg.Font = New-Object Drawing.Font("Segoe UI",8)
$form.Controls.Add($msg)
$save.Add_Click({
  $t = $input.Text.Trim()
  if ($t -notmatch '^hf_[A-Za-z0-9_\-]{8,}$') {
    [Windows.Forms.MessageBox]::Show("That doesn't look like a Hugging Face token.","Owed")
    return
  }
  $dest = Join-Path (Split-Path -Parent $PSScriptRoot) '.env'
  $contents = "HF_TOKEN=$t" + [Environment]::NewLine +
    "HF_WHISPER_MODEL=openai/whisper-large-v3" + [Environment]::NewLine +
    "HF_GEMMA_MODEL=google/gemma-3-12b-it" + [Environment]::NewLine
  [IO.File]::WriteAllText($dest,$contents,(New-Object System.Text.UTF8Encoding($false)))
  $input.Clear()
  $form.DialogResult = [Windows.Forms.DialogResult]::OK
  $form.Close()
})
[void]$form.ShowDialog()
