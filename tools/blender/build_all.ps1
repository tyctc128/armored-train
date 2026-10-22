# 重新產生全部車廂模型（.glb、.blend、預覽圖）
# 用法：在專案根目錄執行  powershell -File tools/blender/build_all.ps1
$blender = "C:\Program Files\Blender Foundation\Blender 5.2\blender.exe"
$jobs = @(
  @('guard_car.py'), @('gun_car.py', 'A'), @('gun_car.py', 'B'), @('gun_car_c.py'),
  @('command_car.py'), @('locomotive.py'), @('tender_car.py'), @('power_car.py')
)
foreach ($j in $jobs) {
  $script = "tools/blender/$($j[0])"
  $args = @('-b', '--factory-startup', '-P', $script)
  if ($j.Count -gt 1) { $args += @('--', $j[1]) }
  Write-Host "建模：$($j -join ' ')"
  & $blender @args 2>&1 | Select-String -Pattern 'DONE|Error|Traceback'
}
Write-Host '完成。若開發伺服器正在執行，新增的模型檔需要重新啟動 npm run dev 才會被讀到。'
